import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedData, CryptoConfig } from './types.js';

const ERROR_MESSAGES = {
  EMPTY_SECRET_NAME: 'シークレット名が指定されていません',
  EMPTY_PLAINTEXT: '暗号化する文字列が空です',
  EMPTY_CIPHERTEXT: '復号化する文字列が空です',
  EMPTY_IV: '初期化ベクトルが指定されていません',
  EMPTY_AUTH_TAG: '認証タグが指定されていません',
  SECRET_NOT_FOUND: 'Secrets Manager からシークレットを取得できませんでした',
  INVALID_SECRET_FORMAT: 'シークレットの形式が不正です（32文字以上の暗号化キーが必要）',
  ENCRYPTION_FAILED: '暗号化処理に失敗しました',
  DECRYPTION_FAILED: '復号化処理に失敗しました',
  AUTHENTICATION_FAILED: '認証タグの検証に失敗しました（データが改ざんされている可能性があります）',
} as const;

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let secretsManagerClient: SecretsManagerClient | null = null;
/** @internal */
let cachedEncryptionKey: Buffer | null = null;

function getSecretsManagerClient(region: string): SecretsManagerClient {
  if (!secretsManagerClient) {
    secretsManagerClient = new SecretsManagerClient({ region });
  }
  return secretsManagerClient;
}

export async function getEncryptionKey(config: CryptoConfig): Promise<Buffer> {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  if (!config.secretName) {
    throw new Error(ERROR_MESSAGES.EMPTY_SECRET_NAME);
  }

  const region = config.region ?? 'ap-northeast-1';
  const client = getSecretsManagerClient(region);

  try {
    const command = new GetSecretValueCommand({ SecretId: config.secretName });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error(ERROR_MESSAGES.SECRET_NOT_FOUND);
    }

    const keyBuffer = Buffer.from(response.SecretString, 'utf8');

    if (keyBuffer.length < 32) {
      throw new Error(ERROR_MESSAGES.INVALID_SECRET_FORMAT);
    }

    cachedEncryptionKey = keyBuffer.subarray(0, 32);
    return cachedEncryptionKey;
  } catch (error) {
    if (error instanceof Error && error.message in ERROR_MESSAGES) {
      throw error;
    }
    throw new Error(
      `${ERROR_MESSAGES.SECRET_NOT_FOUND}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

export async function encrypt(plaintext: string, config: CryptoConfig): Promise<EncryptedData> {
  if (!plaintext) {
    throw new Error(ERROR_MESSAGES.EMPTY_PLAINTEXT);
  }

  try {
    const key = await getEncryptionKey(config);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  } catch (error) {
    const errorMessages = Object.values(ERROR_MESSAGES) as readonly string[];
    if (error instanceof Error && errorMessages.includes(error.message)) {
      throw error;
    }
    throw new Error(
      `${ERROR_MESSAGES.ENCRYPTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

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

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Unsupported state or unable to authenticate data')) {
      throw new Error(ERROR_MESSAGES.AUTHENTICATION_FAILED, { cause: error });
    }

    const errorMessages = Object.values(ERROR_MESSAGES) as readonly string[];
    if (error instanceof Error && errorMessages.includes(error.message)) {
      throw error;
    }

    throw new Error(
      `${ERROR_MESSAGES.DECRYPTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

/** @internal テスト用: キャッシュをクリア */
export function clearCache(): void {
  cachedEncryptionKey = null;
  secretsManagerClient = null;
}
