/**
 * S3 クライアント
 *
 * AWS S3 へのファイルアップロード機能を提供
 */

import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';

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
    region: config.region || process.env.AWS_REGION || 'us-east-1',
  });
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
