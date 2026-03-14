import type { BatchClient } from '@aws-sdk/client-batch';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { S3Client } from '@aws-sdk/client-s3';
import { clearBatchClientCache, getBatchClient } from './batch/index.js';
import {
  clearDynamoDBClientCache,
  getDynamoDBDocumentClient,
} from './dynamodb/index.js';
import { clearS3ClientCache, getS3Client } from './s3/index.js';

export interface AwsClients {
  docClient: DynamoDBDocumentClient;
  s3Client: S3Client;
  batchClient: BatchClient;
}

/**
 * サービスで利用する主要AWSクライアントをまとめて取得する。
 * 各クライアントは内部のリージョン別キャッシュを再利用する。
 * region 未指定時は各クライアントファクトリーのデフォルト解決
 * （`process.env.AWS_REGION` → `us-east-1`）に委譲する。
 */
export function getAwsClients(region?: string): AwsClients {
  return {
    docClient: getDynamoDBDocumentClient(region),
    s3Client: getS3Client(region),
    batchClient: getBatchClient(region),
  };
}

/**
 * サービスで利用する主要AWSクライアントのキャッシュをまとめてクリアする。
 */
export function clearAwsClientsCache(): void {
  clearDynamoDBClientCache();
  clearS3ClientCache();
  clearBatchClientCache();
}
