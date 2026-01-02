declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // AWS環境変数
      readonly AWS_REGION: string;
      readonly DYNAMODB_TABLE: string;
      readonly S3_BUCKET: string;
      readonly BATCH_JOB_QUEUE: string;
      readonly BATCH_JOB_DEFINITION: string;

      // Next.js環境変数
      readonly NODE_ENV: 'development' | 'production' | 'test';
      readonly PORT?: string;
    }
  }
}

export {};
