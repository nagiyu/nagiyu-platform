import { BATCH_JOB_ENV_NAMES, readBatchJobInput } from '@nagiyu/quick-clip-core';
import type { QuickClipBatchRunInput } from '@nagiyu/quick-clip-core';
import { requireEnv } from '@nagiyu/common';

/**
 * 環境変数を読み取り、batch 実行の入力にする。
 *
 * 起動ごとの値 (コマンド・ジョブID・感情フィルター) は web が渡し、読み取りと検証は core が持つ。
 * テーブル名・バケット名・リージョンはジョブ定義が与える。
 */
export const validateEnvironment = (): QuickClipBatchRunInput => {
  // 不足している変数を 1 回のエラーにまとめて報告するため、起動ごとの値も含めて先に存在確認する
  const env = requireEnv([
    BATCH_JOB_ENV_NAMES.COMMAND,
    BATCH_JOB_ENV_NAMES.JOB_ID,
    'DYNAMODB_TABLE_NAME',
    'S3_BUCKET',
    'AWS_REGION',
  ]);

  const { command, jobId, emotionFilter } = readBatchJobInput(process.env);
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || undefined;

  return {
    command,
    jobId,
    tableName: env.DYNAMODB_TABLE_NAME,
    bucketName: env.S3_BUCKET,
    awsRegion: env.AWS_REGION,
    openAiApiKey,
    emotionFilter,
  };
};
