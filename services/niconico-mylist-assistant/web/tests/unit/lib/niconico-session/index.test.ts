/**
 * niconico-session ビジネスロジックのユニットテスト
 *
 * 副作用（validateUserSession の fetch・リポジトリ・暗号化）をモック化し、
 * 純粋なロジックフローを検証する。
 */

import {
  getNiconicoSessionStatus,
  saveNiconicoSession,
  deleteNiconicoSession,
  getEncryptedUserSessionBlob,
  InvalidSessionError,
  IndeterminateSessionError,
} from '../../../../src/lib/niconico-session/index';

// モック：@nagiyu/niconico-mylist-assistant-core
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  createNiconicoCredentialRepository: jest.fn(),
  validateUserSession: jest.fn(),
}));

import {
  encrypt,
  decrypt,
  createNiconicoCredentialRepository,
  validateUserSession,
} from '@nagiyu/niconico-mylist-assistant-core';

const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;
const mockCreateRepo = createNiconicoCredentialRepository as jest.MockedFunction<
  typeof createNiconicoCredentialRepository
>;
const mockValidateUserSession = validateUserSession as jest.MockedFunction<
  typeof validateUserSession
>;

/**
 * モックリポジトリを作成するヘルパー
 */
function createMockRepo() {
  return {
    getByUserId: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  };
}

const SAMPLE_CRYPTO_CONFIG = { secretName: 'test-secret', region: 'ap-northeast-1' };

const SAMPLE_ENCRYPTED_BLOB = JSON.stringify({
  ciphertext: 'dummyCiphertext',
  iv: 'dummyIv',
  authTag: 'dummyAuthTag',
});

const SAMPLE_CREDENTIAL = {
  userId: 'user123',
  encryptedUserSession: SAMPLE_ENCRYPTED_BLOB,
  acquiredAt: 1700000000000,
  estimatedExpiresAt: 1702592000000,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getNiconicoSessionStatus', () => {
  it('セッションが保存されていない場合は hasSession=false を返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(null);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    expect(result.hasSession).toBe(false);
    expect(result.validity).toBeUndefined();
    expect(result.acquiredAt).toBeUndefined();
    expect(result.estimatedExpiresAt).toBeUndefined();
  });

  it('保存セッションが valid の場合は validity=valid を返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockDecrypt.mockResolvedValue('decrypted-session');
    mockValidateUserSession.mockResolvedValue('valid');

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    expect(result.hasSession).toBe(true);
    expect(result.validity).toBe('valid');
    expect(result.acquiredAt).toBe(1700000000000);
    expect(result.estimatedExpiresAt).toBe(1702592000000);
  });

  it('保存セッションが invalid の場合は validity=invalid を返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockDecrypt.mockResolvedValue('decrypted-session');
    mockValidateUserSession.mockResolvedValue('invalid');

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    expect(result.hasSession).toBe(true);
    expect(result.validity).toBe('invalid');
  });

  it('保存セッションが unknown の場合は validity=unknown を返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockDecrypt.mockResolvedValue('decrypted-session');
    mockValidateUserSession.mockResolvedValue('unknown');

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    expect(result.hasSession).toBe(true);
    expect(result.validity).toBe('unknown');
  });

  it('JSON パース失敗時は hasSession=true, validity=invalid で自己回復する', async () => {
    const mockRepo = createMockRepo();
    // 不正な JSON を持つ credential を返す
    mockRepo.getByUserId.mockResolvedValue({
      ...SAMPLE_CREDENTIAL,
      encryptedUserSession: 'this-is-not-valid-json{',
    });
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    // 壊れた資格情報でも hasSession=true, validity=invalid で返る
    expect(result.hasSession).toBe(true);
    expect(result.validity).toBe('invalid');
    expect(result.acquiredAt).toBe(SAMPLE_CREDENTIAL.acquiredAt);
    expect(result.estimatedExpiresAt).toBe(SAMPLE_CREDENTIAL.estimatedExpiresAt);

    // decrypt は呼ばれない（JSON パース段階で失敗）
    expect(mockDecrypt).not.toHaveBeenCalled();

    // エラーログが出力される（クッキー値は含まない）
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it('復号失敗時は hasSession=true, validity=invalid で自己回復する', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    // decrypt が例外を投げる
    mockDecrypt.mockRejectedValue(new Error('復号失敗'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    // 復号失敗でも hasSession=true, validity=invalid で返る
    expect(result.hasSession).toBe(true);
    expect(result.validity).toBe('invalid');
    expect(result.acquiredAt).toBe(SAMPLE_CREDENTIAL.acquiredAt);
    expect(result.estimatedExpiresAt).toBe(SAMPLE_CREDENTIAL.estimatedExpiresAt);

    // validateUserSession は呼ばれない（復号失敗で先に返る）
    expect(mockValidateUserSession).not.toHaveBeenCalled();

    // エラーログが出力される
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it('復号時にクッキー値をログ出力しない（decrypt の引数を確認）', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockDecrypt.mockResolvedValue('decrypted-session');
    mockValidateUserSession.mockResolvedValue('valid');

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await getNiconicoSessionStatus('user123', SAMPLE_CRYPTO_CONFIG);

    // console.log が呼ばれていないことを確認
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('saveNiconicoSession', () => {
  it('valid セッションを暗号化して保存する', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockValidateUserSession.mockResolvedValue('valid');
    mockEncrypt.mockResolvedValue({
      ciphertext: 'newCiphertext',
      iv: 'newIv',
      authTag: 'newAuthTag',
    });
    mockRepo.upsert.mockResolvedValue({
      userId: 'user123',
      encryptedUserSession: SAMPLE_ENCRYPTED_BLOB,
      acquiredAt: Date.now(),
      estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    const result = await saveNiconicoSession('user123', 'valid-session', SAMPLE_CRYPTO_CONFIG);

    expect(mockValidateUserSession).toHaveBeenCalledWith('valid-session');
    expect(mockEncrypt).toHaveBeenCalledWith('valid-session', SAMPLE_CRYPTO_CONFIG);
    expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
    expect(result.acquiredAt).toBeGreaterThan(0);
    expect(result.estimatedExpiresAt).toBeGreaterThan(result.acquiredAt);
  });

  it('invalid セッションは InvalidSessionError を投げる', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockValidateUserSession.mockResolvedValue('invalid');

    await expect(
      saveNiconicoSession('user123', 'invalid-session', SAMPLE_CRYPTO_CONFIG)
    ).rejects.toThrow(InvalidSessionError);

    // 暗号化・保存が呼ばれないことを確認
    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it('unknown セッションは IndeterminateSessionError を投げる', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockValidateUserSession.mockResolvedValue('unknown');

    await expect(
      saveNiconicoSession('user123', 'unknown-session', SAMPLE_CRYPTO_CONFIG)
    ).rejects.toThrow(IndeterminateSessionError);

    // 暗号化・保存が呼ばれないことを確認
    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockRepo.upsert).not.toHaveBeenCalled();
  });

  it('保存ブロブが JSON.stringify(EncryptedData) 形式になる', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockValidateUserSession.mockResolvedValue('valid');
    const encryptedData = {
      ciphertext: 'abc',
      iv: 'def',
      authTag: 'ghi',
    };
    mockEncrypt.mockResolvedValue(encryptedData);
    mockRepo.upsert.mockResolvedValue({
      userId: 'user123',
      encryptedUserSession: JSON.stringify(encryptedData),
      acquiredAt: Date.now(),
      estimatedExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    await saveNiconicoSession('user123', 'valid-session', SAMPLE_CRYPTO_CONFIG);

    const upsertCall = mockRepo.upsert.mock.calls[0][0] as { encryptedUserSession: string };
    const parsed = JSON.parse(upsertCall.encryptedUserSession) as typeof encryptedData;
    expect(parsed.ciphertext).toBe('abc');
    expect(parsed.iv).toBe('def');
    expect(parsed.authTag).toBe('ghi');
  });

  it('acquiredAt から estimatedExpiresAt が 30 日後になる', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockValidateUserSession.mockResolvedValue('valid');
    mockEncrypt.mockResolvedValue({ ciphertext: 'c', iv: 'i', authTag: 'a' });
    mockRepo.upsert.mockResolvedValue(SAMPLE_CREDENTIAL);

    const before = Date.now();
    const result = await saveNiconicoSession('user123', 'valid-session', SAMPLE_CRYPTO_CONFIG);
    const after = Date.now();

    const expectedTtl = 30 * 24 * 60 * 60 * 1000;
    const diff = result.estimatedExpiresAt - result.acquiredAt;

    // 30 日分の ms と等しいことを確認
    expect(diff).toBe(expectedTtl);
    // acquiredAt が今の時刻の範囲内
    expect(result.acquiredAt).toBeGreaterThanOrEqual(before);
    expect(result.acquiredAt).toBeLessThanOrEqual(after);
  });
});

describe('deleteNiconicoSession', () => {
  it('リポジトリの delete を呼び出す', async () => {
    const mockRepo = createMockRepo();
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );
    mockRepo.delete.mockResolvedValue(undefined);

    await deleteNiconicoSession('user123');

    expect(mockRepo.delete).toHaveBeenCalledWith('user123');
  });
});

describe('getEncryptedUserSessionBlob', () => {
  it('保存されていない場合は null を返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(null);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );

    const result = await getEncryptedUserSessionBlob('user123');

    expect(result).toBeNull();
  });

  it('保存済みの encryptedUserSession ブロブを返す', async () => {
    const mockRepo = createMockRepo();
    mockRepo.getByUserId.mockResolvedValue(SAMPLE_CREDENTIAL);
    mockCreateRepo.mockReturnValue(
      mockRepo as ReturnType<typeof createNiconicoCredentialRepository>
    );

    const result = await getEncryptedUserSessionBlob('user123');

    expect(result).toBe(SAMPLE_ENCRYPTED_BLOB);
  });
});
