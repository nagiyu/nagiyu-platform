import type {
  EmotionFilter,
  QuickClipBatchCommand,
  QuickClipBatchRunInput,
} from '@nagiyu/quick-clip-core';
import { requireEnv } from '@nagiyu/common';

const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_JOB_ID: 'ジョブIDが不正です',
  INVALID_EMOTION_FILTER: 'EMOTION_FILTER の値が不正です',
} as const;

const VALID_EMOTION_FILTERS: readonly string[] = ['any', 'laugh', 'excite', 'touch', 'tension'];

const toBatchCommand = (value: string | undefined): QuickClipBatchCommand | null => {
  if (value === 'extract') {
    return value;
  }
  return null;
};

const toEmotionFilter = (value: string | undefined): EmotionFilter => {
  if (value === undefined) {
    return 'any';
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'any';
  }
  if (!VALID_EMOTION_FILTERS.includes(trimmed)) {
    throw new Error(ERROR_MESSAGES.INVALID_EMOTION_FILTER);
  }
  return trimmed as EmotionFilter;
};

export const validateEnvironment = (): QuickClipBatchRunInput => {
  const env = requireEnv(['BATCH_COMMAND', 'JOB_ID', 'DYNAMODB_TABLE_NAME', 'S3_BUCKET', 'AWS_REGION']);

  // BATCH_COMMAND は存在チェック済みのうえで値の妥当性を検証する
  const command = toBatchCommand(env.BATCH_COMMAND);
  if (!command) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: BATCH_COMMAND`);
  }

  const { JOB_ID: jobId, DYNAMODB_TABLE_NAME: tableName, S3_BUCKET: bucketName, AWS_REGION: awsRegion } = env;

  // 英数字・アンダースコア・ハイフンのみ許可し、S3キー/パス生成で安全に扱える形式に制限する。
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    throw new Error(ERROR_MESSAGES.INVALID_JOB_ID);
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  const emotionFilter = toEmotionFilter(process.env.EMOTION_FILTER);

  return {
    command,
    jobId,
    tableName,
    bucketName,
    awsRegion,
    openAiApiKey,
    emotionFilter,
  };
};
