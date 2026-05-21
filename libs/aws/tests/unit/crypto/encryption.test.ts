import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, clearCache } from '../../../src/crypto/encryption.js';
import type { EncryptedData, CryptoConfig } from '../../../src/crypto/types.js';

const secretsManagerMock = mockClient(SecretsManagerClient);
const TEST_KEY_BASE64 = randomBytes(32).toString('base64');

describe('crypto utilities', () => {
  beforeEach(() => {
    secretsManagerMock.reset();
    clearCache();
  });

  afterEach(() => {
    clearCache();
  });

  describe('encrypt', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('正常に文字列を暗号化できる', async () => {
      const result = await encrypt('password123', config);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(() => Buffer.from(result.ciphertext, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.authTag, 'base64')).not.toThrow();
    });

    it('日本語を含む文字列を暗号化できる', async () => {
      const result = await encrypt('パスワード123！', config);

      expect(result.ciphertext).toBeTruthy();
    });

    it('空文字列を暗号化しようとするとエラーになる', async () => {
      await expect(encrypt('', config)).rejects.toThrow('暗号化する文字列が空です');
    });

    it('シークレット名が空の場合エラーになる', async () => {
      await expect(encrypt('password', { secretName: '' })).rejects.toThrow(
        'シークレット名が指定されていません'
      );
    });

    it('Secrets Manager からキーを取得できない場合エラーになる', async () => {
      secretsManagerMock.reset();
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: undefined });

      await expect(encrypt('password', config)).rejects.toThrow(
        'Secrets Manager からシークレットを取得できませんでした'
      );
    });

    it('キーのサイズが不正な場合エラーになる', async () => {
      secretsManagerMock.reset();
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: 'tooshortkey12345' });

      await expect(encrypt('password', config)).rejects.toThrow(
        'シークレットの形式が不正です（32文字以上の暗号化キーが必要）'
      );
    });

    it('2回目の呼び出しではキャッシュされたキーを使用する', async () => {
      await encrypt('password1', config);
      await encrypt('password2', config);

      expect(secretsManagerMock.calls()).toHaveLength(1);
    });

    it('同じ平文でも毎回異なる暗号文が生成される（IVがランダム）', async () => {
      const result1 = await encrypt('password123', config);
      clearCache();
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: TEST_KEY_BASE64 });
      const result2 = await encrypt('password123', config);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });

  describe('decrypt', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: TEST_KEY_BASE64 });
    });

    it('正常に暗号文を復号化できる', async () => {
      const encrypted = await encrypt('password123', config);
      expect(await decrypt(encrypted, config)).toBe('password123');
    });

    it('日本語を含む文字列を復号化できる', async () => {
      const encrypted = await encrypt('パスワード123！', config);
      expect(await decrypt(encrypted, config)).toBe('パスワード123！');
    });

    it('長い文字列を復号化できる', async () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = await encrypt(plaintext, config);
      expect(await decrypt(encrypted, config)).toBe(plaintext);
    });

    it('暗号文が空の場合エラーになる', async () => {
      const data: EncryptedData = { ciphertext: '', iv: 'test', authTag: 'test' };
      await expect(decrypt(data, config)).rejects.toThrow('復号化する文字列が空です');
    });

    it('IVが空の場合エラーになる', async () => {
      const data: EncryptedData = { ciphertext: 'test', iv: '', authTag: 'test' };
      await expect(decrypt(data, config)).rejects.toThrow('初期化ベクトルが指定されていません');
    });

    it('認証タグが空の場合エラーになる', async () => {
      const data: EncryptedData = { ciphertext: 'test', iv: 'test', authTag: '' };
      await expect(decrypt(data, config)).rejects.toThrow('認証タグが指定されていません');
    });

    it('改ざんされたデータの場合エラーになる', async () => {
      const encrypted = await encrypt('password123', config);
      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + 'XXXX',
      };

      await expect(decrypt(tampered, config)).rejects.toThrow(
        '認証タグの検証に失敗しました（データが改ざんされている可能性があります）'
      );
    });

    it('不正なBase64形式の場合エラーになる', async () => {
      const data: EncryptedData = {
        ciphertext: 'invalid-base64!!!',
        iv: Buffer.from(randomBytes(12)).toString('base64'),
        authTag: Buffer.from(randomBytes(16)).toString('base64'),
      };

      await expect(decrypt(data, config)).rejects.toThrow(
        '認証タグの検証に失敗しました（データが改ざんされている可能性があります）'
      );
    });
  });

  describe('encrypt と decrypt の組み合わせ', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: TEST_KEY_BASE64 });
    });

    it('暗号化と復号化のラウンドトリップが正しく動作する', async () => {
      const testCases = [
        'simple',
        'with spaces',
        '日本語テスト',
        'special!@#$%^&*()chars',
        'a'.repeat(1000),
        '{"json": "data", "nested": {"key": "value"}}',
      ];

      for (const plaintext of testCases) {
        const encrypted = await encrypt(plaintext, config);
        expect(await decrypt(encrypted, config)).toBe(plaintext);
      }
    });
  });

  describe('clearCache', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: TEST_KEY_BASE64 });
    });

    it('キャッシュをクリアすると再度 Secrets Manager から取得する', async () => {
      await encrypt('password1', config);
      expect(secretsManagerMock.calls()).toHaveLength(1);

      clearCache();

      await encrypt('password2', config);
      expect(secretsManagerMock.calls()).toHaveLength(2);
    });
  });

  describe('リージョン設定', () => {
    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({ SecretString: TEST_KEY_BASE64 });
    });

    it('カスタムリージョンを使用できる', async () => {
      await encrypt('password', { secretName: 'test-key', region: 'us-east-1' });
      expect(secretsManagerMock.calls()).toHaveLength(1);
    });

    it('リージョンを指定しない場合はデフォルトで ap-northeast-1 を使用', async () => {
      await encrypt('password', { secretName: 'test-key' });
      expect(secretsManagerMock.calls()).toHaveLength(1);
    });
  });
});
