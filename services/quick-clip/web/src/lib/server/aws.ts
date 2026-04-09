import { BatchClient } from '@aws-sdk/client-batch';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const DEFAULT_REGION = 'us-east-1';

const ERROR_MESSAGES = {
  MISSING_DYNAMODB_TABLE_NAME: '環境変数 DYNAMODB_TABLE_NAME が設定されていません',
  MISSING_S3_BUCKET: '環境変数 S3_BUCKET が設定されていません',
  MISSING_BATCH_JOB_QUEUE_ARN: '環境変数 BATCH_JOB_QUEUE_ARN が設定されていません',
  MISSING_BATCH_JOB_DEFINITION_PREFIX: '環境変数 BATCH_JOB_DEFINITION_PREFIX が設定されていません',
  MISSING_CLIP_REGENERATE_FUNCTION_NAME:
    '環境変数 CLIP_REGENERATE_FUNCTION_NAME が設定されていません',
  MISSING_ZIP_GENERATOR_FUNCTION_NAME: '環境変数 ZIP_GENERATOR_FUNCTION_NAME が設定されていません',
} as const;

let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedS3Client: S3Client | null = null;
let cachedBatchClient: BatchClient | null = null;
let cachedLambdaClient: LambdaClient | null = null;

const getRegion = (): string => process.env.AWS_REGION || DEFAULT_REGION;

const getRequiredEnv = (value: string | undefined, errorMessage: string): string => {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0) {
    throw new Error(errorMessage);
  }
  return normalized;
};

export const getDynamoDBDocumentClient = (): DynamoDBDocumentClient => {
  if (!cachedDocClient) {
    const dynamoClient = new DynamoDBClient({ region: getRegion() });
    cachedDocClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  return cachedDocClient;
};

export const getS3Client = (): S3Client => {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: getRegion() });
  }
  return cachedS3Client;
};

export const getBatchClient = (): BatchClient => {
  if (!cachedBatchClient) {
    cachedBatchClient = new BatchClient({ region: getRegion() });
  }
  return cachedBatchClient;
};

export const getLambdaClient = (): LambdaClient => {
  if (!cachedLambdaClient) {
    cachedLambdaClient = new LambdaClient({ region: getRegion() });
  }
  return cachedLambdaClient;
};

export const getTableName = (): string =>
  getRequiredEnv(process.env.DYNAMODB_TABLE_NAME, ERROR_MESSAGES.MISSING_DYNAMODB_TABLE_NAME);

export const getBucketName = (): string =>
  getRequiredEnv(process.env.S3_BUCKET, ERROR_MESSAGES.MISSING_S3_BUCKET);

export const getBatchJobQueueArn = (): string =>
  getRequiredEnv(process.env.BATCH_JOB_QUEUE_ARN, ERROR_MESSAGES.MISSING_BATCH_JOB_QUEUE_ARN);

export const getBatchJobDefinitionPrefix = (): string =>
  getRequiredEnv(
    process.env.BATCH_JOB_DEFINITION_PREFIX,
    ERROR_MESSAGES.MISSING_BATCH_JOB_DEFINITION_PREFIX
  );

export const getClipRegenerateFunctionName = (): string =>
  getRequiredEnv(
    process.env.CLIP_REGENERATE_FUNCTION_NAME,
    ERROR_MESSAGES.MISSING_CLIP_REGENERATE_FUNCTION_NAME
  );

export const getZipGeneratorFunctionName = (): string =>
  getRequiredEnv(
    process.env.ZIP_GENERATOR_FUNCTION_NAME,
    ERROR_MESSAGES.MISSING_ZIP_GENERATOR_FUNCTION_NAME
  );

export const getAwsRegion = (): string => getRegion();

export const getOpenAiApiKey = (): string | undefined => {
  const value = process.env.OPENAI_API_KEY?.trim() ?? '';
  return value.length > 0 ? value : undefined;
};
