import type { EmotionFilter, QuickClipBatchCommand, QuickClipBatchRunInput } from '@nagiyu/quick-clip-core';

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
  if (value === undefined || value.trim().length === 0) {
    return 'any';
  }
  const trimmed = value.trim();
  if (!VALID_EMOTION_FILTERS.includes(trimmed)) {
    throw new Error(ERROR_MESSAGES.INVALID_EMOTION_FILTER);
  }
  return trimmed as EmotionFilter;
};

export const validateEnvironment = (): QuickClipBatchRunInput => {
  const command = toBatchCommand(process.env.BATCH_COMMAND);
  const jobId = process.env.JOB_ID?.trim() ?? '';
  const tableName = process.env.DYNAMODB_TABLE_NAME?.trim() ?? '';
  const bucketName = process.env.S3_BUCKET?.trim() ?? '';
  const awsRegion = process.env.AWS_REGION?.trim() ?? '';
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  const emotionFilter = toEmotionFilter(process.env.EMOTION_FILTER);

  const missing: string[] = [];
  if (!command) {
    missing.push('BATCH_COMMAND');
  }
  if (jobId.length === 0) {
    missing.push('JOB_ID');
  }
  if (tableName.length === 0) {
    missing.push('DYNAMODB_TABLE_NAME');
  }
  if (bucketName.length === 0) {
    missing.push('S3_BUCKET');
  }
  if (awsRegion.length === 0) {
    missing.push('AWS_REGION');
  }

  if (missing.length > 0) {
    throw new Error(`${ERROR_MESSAGES.MISSING_ENV}: ${missing.join(', ')}`);
  }
  // 英数字・アンダースコア・ハイフンのみ許可し、S3キー/パス生成で安全に扱える形式に制限する。
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
    throw new Error(ERROR_MESSAGES.INVALID_JOB_ID);
  }

  return {
    command: command as QuickClipBatchCommand,
    jobId,
    tableName,
    bucketName,
    awsRegion,
    openAiApiKey,
    emotionFilter,
  };
};
