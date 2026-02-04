import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedData, CryptoConfig } from '../types/crypto.js';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  EMPTY_SECRET_NAME: 'シークレット名が指定されていません',
  EMPTY_PLAINTEXT: '暗号化する文字列が空です',
  EMPTY_CIPHERTEXT: '復号化する文字列が空です',
  EMPTY_IV: '初期化ベクトルが指定されていません',
  EMPTY_AUTH_TAG: '認証タグが指定されていません',
  SECRET_NOT_FOUND: 'Secrets Manager からシークレットを取得できませんでした',
  INVALID_SECRET_FORMAT: 'シークレットの形式が不正です（32バイトの暗号化キーが必要）',
  ENCRYPTION_FAILED: '暗号化処理に失敗しました',
  DECRYPTION_FAILED: '復号化処理に失敗しました',
  AUTHENTICATION_FAILED: '認証タグの検証に失敗しました（データが改ざんされている可能性があります）',
} as const;

/**
 * 暗号化アルゴリズム（AES-256-GCM）
 */
const ALGORITHM = 'aes-256-gcm';

/**
 * 初期化ベクトルのサイズ（バイト）
 */
const IV_LENGTH = 12;

/**
 * 認証タグのサイズ（バイト）
 */
const AUTH_TAG_LENGTH = 16;

/**
 * Secrets Manager クライアントのキャッシュ
 */
let secretsManagerClient: SecretsManagerClient | null = null;

/**
 * 暗号化キーのキャッシュ
 * @internal
 */
let cachedEncryptionKey: Buffer | null = null;

/**
 * Secrets Manager クライアントを取得
 */
function getSecretsManagerClient(region: string): SecretsManagerClient {
  if (!secretsManagerClient) {
    secretsManagerClient = new SecretsManagerClient({ region });
  }
  return secretsManagerClient;
}

/**
 * Secrets Manager から暗号化キーを取得
 *
 * @param config - 暗号化設定
 * @returns 暗号化キー（32バイト）
 * @throws {Error} シークレット名が空の場合
 * @throws {Error} シークレットが取得できない場合
 * @throws {Error} シークレットの形式が不正な場合
 */
async function getEncryptionKey(config: CryptoConfig): Promise<Buffer> {
  // キャッシュがあれば返す
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  if (!config.secretName) {
    throw new Error(ERROR_MESSAGES.EMPTY_SECRET_NAME);
  }

  const region = config.region ?? 'ap-northeast-1';
  const client = getSecretsManagerClient(region);

  try {
    const command = new GetSecretValueCommand({
      SecretId: config.secretName,
    });

    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(ERROR_MESSAGES.SECRET_NOT_FOUND);
    }

    // シークレットは Base64 エンコードされた 32 バイトのキーと想定
    const keyBuffer = Buffer.from(response.SecretString, 'base64');

    if (keyBuffer.length !== 32) {
      throw new Error(ERROR_MESSAGES.INVALID_SECRET_FORMAT);
    }

    // キャッシュに保存
    cachedEncryptionKey = keyBuffer;

    return keyBuffer;
  } catch (error) {
    if (error instanceof Error && error.message in ERROR_MESSAGES) {
      throw error;
    }
    throw new Error(`${ERROR_MESSAGES.SECRET_NOT_FOUND}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文字列を AES-256-GCM で暗号化
 *
 * @param plaintext - 暗号化する文字列
 * @param config - 暗号化設定
 * @returns 暗号化されたデータ
 * @throws {Error} 平文が空の場合
 * @throws {Error} 暗号化処理に失敗した場合
 *
 * @example
 * ```typescript
 * const config = { secretName: 'my-encryption-key' };
 * const encrypted = await encrypt('password123', config);
 * console.log(encrypted.ciphertext); // Base64エンコードされた暗号文
 * ```
 */
export async function encrypt(plaintext: string, config: CryptoConfig): Promise<EncryptedData> {
  if (!plaintext) {
    throw new Error(ERROR_MESSAGES.EMPTY_PLAINTEXT);
  }

  try {
    const key = await getEncryptionKey(config);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  } catch (error) {
    // 既知のエラーメッセージの場合はそのままスロー
    if (error instanceof Error && Object.values(ERROR_MESSAGES).includes(error.message as any)) {
      throw error;
    }
    throw new Error(`${ERROR_MESSAGES.ENCRYPTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * AES-256-GCM で暗号化されたデータを復号化
 *
 * @param encryptedData - 暗号化されたデータ
 * @param config - 暗号化設定
 * @returns 復号化された文字列
 * @throws {Error} 暗号文、IV、または認証タグが空の場合
 * @throws {Error} 復号化処理に失敗した場合
 * @throws {Error} 認証タグの検証に失敗した場合
 *
 * @example
 * ```typescript
 * const config = { secretName: 'my-encryption-key' };
 * const decrypted = await decrypt(encryptedData, config);
 * console.log(decrypted); // 'password123'
 * ```
 */
export async function decrypt(encryptedData: EncryptedData, config: CryptoConfig): Promise<string> {
  if (!encryptedData.ciphertext) {
    throw new Error(ERROR_MESSAGES.EMPTY_CIPHERTEXT);
  }

  if (!encryptedData.iv) {
    throw new Error(ERROR_MESSAGES.EMPTY_IV);
  }

  if (!encryptedData.authTag) {
    throw new Error(ERROR_MESSAGES.EMPTY_AUTH_TAG);
  }

  try {
    const key = await getEncryptionKey(config);
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    // 認証タグエラーの場合は専用メッセージ
    // decipher.final() が投げる認証エラーを検出
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('Unsupported state or unable to authenticate data')) {
      throw new Error(ERROR_MESSAGES.AUTHENTICATION_FAILED);
    }

    // 既知のエラーメッセージの場合はそのままスロー
    if (error instanceof Error && Object.values(ERROR_MESSAGES).includes(error.message as any)) {
      throw error;
    }

    throw new Error(`${ERROR_MESSAGES.DECRYPTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * テスト用: キャッシュをクリア
 * @internal
 */
export function clearCache(): void {
  cachedEncryptionKey = null;
  secretsManagerClient = null;
}
