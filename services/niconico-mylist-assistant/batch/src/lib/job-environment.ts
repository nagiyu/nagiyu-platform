/**
 * バッチジョブが環境変数から受け取る値の読み取り
 */

import { parseJobInput } from '@nagiyu/niconico-mylist-assistant-core';
import { formatLocalDateTime, requireEnv } from '@nagiyu/common';
import { DEFAULT_MYLIST_NAME_PREFIX } from '../constants.js';
import type { MylistRegistrationJobParams } from '../types.js';

/**
 * バッチの実行環境の設定値
 */
export interface BatchEnvironment {
  dynamodbTableName: string;
  encryptionSecretName: string;
  awsRegion: string;
  nodeEnv: string;
}

/**
 * ジョブ定義で設定される環境変数を読み取る
 *
 * DYNAMODB_TABLE_NAME / AWS_REGION はジョブ定義が必ず設定するため必須とし、欠けたら起動直後に失敗させる。
 */
export function readEnvironmentVariables(): BatchEnvironment {
  const { DYNAMODB_TABLE_NAME: dynamodbTableName, AWS_REGION: awsRegion } = requireEnv([
    'DYNAMODB_TABLE_NAME',
    'AWS_REGION',
  ]);
  // 暗号化キー名は ENCRYPTION_SECRET_NAME を優先し、旧名 SHARED_SECRET_KEY でも動かす
  const encryptionSecretName =
    process.env.ENCRYPTION_SECRET_NAME || process.env.SHARED_SECRET_KEY || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log('=== 環境変数 ===');
  console.log(`DYNAMODB_TABLE_NAME: ${dynamodbTableName}`);
  console.log(
    `ENCRYPTION_SECRET_NAME: ${encryptionSecretName ? encryptionSecretName : '(not set)'}`
  );
  console.log(`AWS_REGION: ${awsRegion}`);
  console.log(`NODE_ENV: ${nodeEnv}`);
  console.log('================');

  return { dynamodbTableName, encryptionSecretName, awsRegion, nodeEnv };
}

/**
 * ジョブパラメータを環境変数から取得する
 *
 * ジョブ ID は web からの入力ではなく、AWS Batch が実行時に設定する AWS_BATCH_JOB_ID から読む。
 */
export function getJobParameters(): MylistRegistrationJobParams {
  const input = parseJobInput(process.env, {
    defaultMylistName: `${DEFAULT_MYLIST_NAME_PREFIX} ${formatLocalDateTime()}`,
  });
  const jobId = process.env.AWS_BATCH_JOB_ID || '';

  if (!jobId) {
    console.warn('警告: AWS_BATCH_JOB_ID が設定されていません');
  }

  console.log('=== ジョブパラメータ ===');
  console.log(`ジョブID: ${jobId || '(not set)'}`);
  console.log(`ユーザーID: ${input.userId}`);
  console.log(`マイリスト名: ${input.mylistName}`);
  console.log(`動画数: ${input.videoIds.length}`);
  console.log('========================');

  return { jobId, ...input };
}
