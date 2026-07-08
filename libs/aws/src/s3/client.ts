/**
 * S3 クライアント
 *
 * AWS S3 へのファイルアップロード機能を提供
 */

import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_REGION = 'us-east-1';
const cachedClients = new Map<string, S3Client>();

/**
 * S3 クライアントの設定
 */
export interface S3ClientConfig {
  region?: string;
}

/**
 * ファイルアップロードのオプション
 */
export interface UploadFileOptions {
  bucketName: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * S3 クライアントを作成
 *
 * @param config - クライアント設定
 * @returns S3Client インスタンス
 */
export function createS3Client(config: S3ClientConfig = {}): S3Client {
  return new S3Client({
    region: config.region || process.env.AWS_REGION || DEFAULT_REGION,
  });
}

/**
 * S3 クライアントのキャッシュをクリアする（主にテスト用）。
 */
export function clearS3ClientCache(): void {
  cachedClients.clear();
}

/**
 * S3 クライアントを取得する。
 * 同一リージョンのクライアントはキャッシュを再利用し、未指定時は `AWS_REGION`、
 * さらに未設定の場合は `us-east-1` を使用する。
 */
export function getS3Client(region?: string): S3Client {
  const targetRegion = region || process.env.AWS_REGION || DEFAULT_REGION;
  const cachedClient = cachedClients.get(targetRegion);

  if (cachedClient) {
    return cachedClient;
  }

  const client = createS3Client({ region: targetRegion });
  cachedClients.set(targetRegion, client);

  return client;
}

/**
 * ファイルを S3 にアップロード
 *
 * @param client - S3 クライアント
 * @param options - アップロードオプション
 * @returns アップロード結果の ETag
 */
export async function uploadFile(
  client: S3Client,
  options: UploadFileOptions
): Promise<string | undefined> {
  const { bucketName, key, body, contentType, metadata } = options;

  const params: PutObjectCommandInput = {
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  };

  const command = new PutObjectCommand(params);
  const response = await client.send(command);

  return response.ETag;
}

/**
 * Presigned URL 生成の共通オプション
 */
export interface PresignedUrlOptions {
  bucketName: string;
  key: string;
  /** URL の有効期限（秒） */
  expiresIn: number;
}

/**
 * アップロード用 Presigned URL 生成のオプション
 */
export interface PresignedUploadUrlOptions extends PresignedUrlOptions {
  contentType?: string;
}

/**
 * アップロード用 Presigned URL（PUT）を生成する。
 *
 * @param options - バケット名・キー・有効期限・Content-Type
 * @param client - S3 クライアント（省略時は getS3Client() を使用）
 * @returns アップロード用 Presigned URL
 */
export async function createPresignedUploadUrl(
  options: PresignedUploadUrlOptions,
  client: S3Client = getS3Client()
): Promise<string> {
  const { bucketName, key, contentType, expiresIn } = options;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * ダウンロード用 Presigned URL（GET）を生成する。
 *
 * @param options - バケット名・キー・有効期限
 * @param client - S3 クライアント（省略時は getS3Client() を使用）
 * @returns ダウンロード用 Presigned URL
 */
export async function createPresignedDownloadUrl(
  options: PresignedUrlOptions,
  client: S3Client = getS3Client()
): Promise<string> {
  const { bucketName, key, expiresIn } = options;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * S3 オブジェクトの URL を生成
 *
 * @param bucketName - バケット名
 * @param key - オブジェクトキー
 * @param region - リージョン（デフォルト: us-east-1）
 * @returns S3 オブジェクトの URL
 */
export function getS3ObjectUrl(bucketName: string, key: string, region = 'us-east-1'): string {
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
}
