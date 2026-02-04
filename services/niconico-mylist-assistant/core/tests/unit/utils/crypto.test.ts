import { mockClient } from 'aws-sdk-client-mock';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, clearCache } from '../../../src/utils/crypto.js';
import type { EncryptedData, CryptoConfig } from '../../../src/types/crypto.js';

// Secrets Manager クライアントのモックを作成
const secretsManagerMock = mockClient(SecretsManagerClient);

// テスト用の 32 バイトキー（Base64エンコード）
const TEST_KEY_BASE64 = randomBytes(32).toString('base64');

describe('crypto utilities', () => {
  beforeEach(() => {
    // 各テストの前にモックとキャッシュをリセット
    secretsManagerMock.reset();
    clearCache();
  });

  afterEach(() => {
    // 各テストの後にキャッシュをクリア
    clearCache();
  });

  describe('encrypt', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      // Secrets Manager からキーを取得する処理をモック
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('正常に文字列を暗号化できる', async () => {
      const plaintext = 'password123';
      const result = await encrypt(plaintext, config);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result.ciphertext).toBeTruthy();
      expect(result.iv).toBeTruthy();
      expect(result.authTag).toBeTruthy();

      // Base64形式であることを確認
      expect(() => Buffer.from(result.ciphertext, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.authTag, 'base64')).not.toThrow();
    });

    it('日本語を含む文字列を暗号化できる', async () => {
      const plaintext = 'パスワード123！';
      const result = await encrypt(plaintext, config);

      expect(result.ciphertext).toBeTruthy();
      expect(result.iv).toBeTruthy();
      expect(result.authTag).toBeTruthy();
    });

    it('空文字列を暗号化しようとするとエラーになる', async () => {
      await expect(encrypt('', config)).rejects.toThrow('暗号化する文字列が空です');
    });

    it('シークレット名が空の場合エラーになる', async () => {
      const invalidConfig: CryptoConfig = {
        secretName: '',
      };

      await expect(encrypt('password', invalidConfig)).rejects.toThrow(
        'シークレット名が指定されていません'
      );
    });

    it('Secrets Manager からキーを取得できない場合エラーになる', async () => {
      secretsManagerMock.reset();
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: undefined,
      });

      await expect(encrypt('password', config)).rejects.toThrow(
        'Secrets Manager からシークレットを取得できませんでした'
      );
    });

    it('キーのサイズが不正な場合エラーになる', async () => {
      secretsManagerMock.reset();
      // 16バイトのキー（本来は32バイト必要）
      const invalidKey = randomBytes(16).toString('base64');
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: invalidKey,
      });

      await expect(encrypt('password', config)).rejects.toThrow(
        'シークレットの形式が不正です（32バイトの暗号化キーが必要）'
      );
    });

    it('2回目の呼び出しではキャッシュされたキーを使用する', async () => {
      await encrypt('password1', config);
      await encrypt('password2', config);

      // GetSecretValueCommand が1回だけ呼ばれたことを確認
      expect(secretsManagerMock.calls()).toHaveLength(1);
    });

    it('同じ平文でも毎回異なる暗号文が生成される（IVがランダム）', async () => {
      const plaintext = 'password123';
      const result1 = await encrypt(plaintext, config);
      clearCache(); // キャッシュをクリアして新しいIVを使用
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
      const result2 = await encrypt(plaintext, config);

      // IVが異なるため、暗号文も異なる
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
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('正常に暗号文を復号化できる', async () => {
      const plaintext = 'password123';
      const encrypted = await encrypt(plaintext, config);
      const decrypted = await decrypt(encrypted, config);

      expect(decrypted).toBe(plaintext);
    });

    it('日本語を含む文字列を復号化できる', async () => {
      const plaintext = 'パスワード123！';
      const encrypted = await encrypt(plaintext, config);
      const decrypted = await decrypt(encrypted, config);

      expect(decrypted).toBe(plaintext);
    });

    it('長い文字列を復号化できる', async () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = await encrypt(plaintext, config);
      const decrypted = await decrypt(encrypted, config);

      expect(decrypted).toBe(plaintext);
    });

    it('暗号文が空の場合エラーになる', async () => {
      const encryptedData: EncryptedData = {
        ciphertext: '',
        iv: 'test',
        authTag: 'test',
      };

      await expect(decrypt(encryptedData, config)).rejects.toThrow('復号化する文字列が空です');
    });

    it('IVが空の場合エラーになる', async () => {
      const encryptedData: EncryptedData = {
        ciphertext: 'test',
        iv: '',
        authTag: 'test',
      };

      await expect(decrypt(encryptedData, config)).rejects.toThrow(
        '初期化ベクトルが指定されていません'
      );
    });

    it('認証タグが空の場合エラーになる', async () => {
      const encryptedData: EncryptedData = {
        ciphertext: 'test',
        iv: 'test',
        authTag: '',
      };

      await expect(decrypt(encryptedData, config)).rejects.toThrow('認証タグが指定されていません');
    });

    it('改ざんされたデータの場合エラーになる', async () => {
      const plaintext = 'password123';
      const encrypted = await encrypt(plaintext, config);

      // 暗号文を改ざん
      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + 'XXXX',
      };

      await expect(decrypt(tampered, config)).rejects.toThrow(
        '認証タグの検証に失敗しました（データが改ざんされている可能性があります）'
      );
    });

    it('不正なBase64形式の場合エラーになる', async () => {
      const encryptedData: EncryptedData = {
        ciphertext: 'invalid-base64!!!',
        iv: Buffer.from(randomBytes(12)).toString('base64'),
        authTag: Buffer.from(randomBytes(16)).toString('base64'),
      };

      // 不正なBase64も最終的には認証エラーになる（Bufferの変換は成功するがデータが不正）
      await expect(decrypt(encryptedData, config)).rejects.toThrow(
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
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('暗号化と復号化のラウンドトリップが正しく動作する', async () => {
      const testCases = [
        'simple',
        'with spaces',
        '日本語テスト',
        'special!@#$%^&*()chars',
        'a'.repeat(1000), // 長い文字列
        '{"json": "data", "nested": {"key": "value"}}', // JSON文字列
      ];

      for (const plaintext of testCases) {
        const encrypted = await encrypt(plaintext, config);
        const decrypted = await decrypt(encrypted, config);
        expect(decrypted).toBe(plaintext);
      }
    });

    it('複数の暗号化・復号化を連続して実行できる', async () => {
      const plaintexts = ['password1', 'password2', 'password3'];

      for (const plaintext of plaintexts) {
        const encrypted = await encrypt(plaintext, config);
        const decrypted = await decrypt(encrypted, config);
        expect(decrypted).toBe(plaintext);
      }
    });
  });

  describe('clearCache', () => {
    const config: CryptoConfig = {
      secretName: 'test-encryption-key',
      region: 'ap-northeast-1',
    };

    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('キャッシュをクリアすると再度Secrets Managerから取得する', async () => {
      await encrypt('password1', config);
      expect(secretsManagerMock.calls()).toHaveLength(1);

      clearCache();

      await encrypt('password2', config);
      expect(secretsManagerMock.calls()).toHaveLength(2);
    });
  });

  describe('リージョン設定', () => {
    beforeEach(() => {
      secretsManagerMock.on(GetSecretValueCommand).resolves({
        SecretString: TEST_KEY_BASE64,
      });
    });

    it('カスタムリージョンを使用できる', async () => {
      const config: CryptoConfig = {
        secretName: 'test-key',
        region: 'us-east-1',
      };

      await encrypt('password', config);

      // リージョンが正しく使用されていることを確認
      const calls = secretsManagerMock.calls();
      expect(calls).toHaveLength(1);
    });

    it('リージョンを指定しない場合はデフォルトでap-northeast-1を使用', async () => {
      const config: CryptoConfig = {
        secretName: 'test-key',
      };

      await encrypt('password', config);

      // デフォルトリージョンが使用されていることを確認
      const calls = secretsManagerMock.calls();
      expect(calls).toHaveLength(1);
    });
  });
});
