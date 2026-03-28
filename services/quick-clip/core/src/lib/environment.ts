const ERROR_MESSAGES = {
  MISSING_ENV: '必要な環境変数が設定されていません',
  INVALID_JOB_ID: 'ジョブIDが不正です',
} as const;

export type BatchCommand = 'extract' | 'split';

export type EnvironmentVariables = {
  batchCommand: BatchCommand;
  jobId: string;
  tableName: string;
  bucketName: string;
  awsRegion: string;
};

const toBatchCommand = (value: string | undefined): BatchCommand | null => {
  if (value === 'extract' || value === 'split') {
    return value;
  }
  return null;
};

export const validateEnvironment = (): EnvironmentVariables => {
  const batchCommand = toBatchCommand(process.env.BATCH_COMMAND);
  const jobId = process.env.JOB_ID?.trim() ?? '';
  const tableName = process.env.DYNAMODB_TABLE_NAME?.trim() ?? '';
  const bucketName = process.env.S3_BUCKET?.trim() ?? '';
  const awsRegion = process.env.AWS_REGION?.trim() ?? '';

  const missing: string[] = [];
  if (!batchCommand) {
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
  if (!/^[\w-]+$/u.test(jobId)) {
    throw new Error(ERROR_MESSAGES.INVALID_JOB_ID);
  }

  return {
    batchCommand: batchCommand as BatchCommand,
    jobId,
    tableName,
    bucketName,
    awsRegion,
  };
};
