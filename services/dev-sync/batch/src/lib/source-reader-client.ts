/**
 * prod ソーステーブル読み取り用 DynamoDB Document Client
 *
 * dev-sync は dev アカウントで動作するが、コピー元（prod）テーブルは
 * AWS マネージドキー暗号化のため DynamoDB リソースポリシーによる
 * クロスアカウント読み取り許可が使えない。そのため prod アカウント側に
 * 用意された読み取り専用ロール（`SOURCE_READER_ROLE_ARN`）を AssumeRole し、
 * 発行された一時認証情報で prod テーブルを読み取る。
 *
 * dest（dev）テーブルへのアクセスは `@nagiyu/aws` の
 * `getDynamoDBDocumentClient`（デフォルト認証情報＝dev アカウント自身）を
 * そのまま使用し、本モジュールは source 用クライアントの生成のみを担う。
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { ERROR_MESSAGES } from './errors.js';

const DEFAULT_REGION = 'us-east-1';

/** AssumeRole 時のセッション名（CloudTrail 上での識別用） */
const ASSUME_ROLE_SESSION_NAME = 'nagiyu-dev-sync';

/**
 * 環境変数 `SOURCE_READER_ROLE_ARN` から prod 読み取り専用ロールの ARN を取得する。
 *
 * 未設定の場合、誤って dev アカウント自身（同一アカウント）のテーブルを
 * 読みに行くフォールバックは行わずエラーにする。
 */
export function getSourceReaderRoleArn(): string {
  const roleArn = process.env.SOURCE_READER_ROLE_ARN;

  if (!roleArn) {
    throw new Error(ERROR_MESSAGES.SOURCE_READER_ROLE_ARN_MISSING);
  }

  return roleArn;
}

/**
 * prod ソーステーブル読み取り専用の DynamoDB Document Client を生成する。
 *
 * `SOURCE_READER_ROLE_ARN` を AssumeRole した一時認証情報を使用するため、
 * dest（dev）用クライアント（デフォルト認証情報）とは別インスタンスになる。
 */
export function createSourceDynamoDBDocumentClient(region?: string): DynamoDBDocumentClient {
  const roleArn = getSourceReaderRoleArn();
  const targetRegion = region || process.env.AWS_REGION || DEFAULT_REGION;

  const client = new DynamoDBClient({
    region: targetRegion,
    credentials: fromTemporaryCredentials({
      params: {
        RoleArn: roleArn,
        RoleSessionName: ASSUME_ROLE_SESSION_NAME,
      },
    }),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}
