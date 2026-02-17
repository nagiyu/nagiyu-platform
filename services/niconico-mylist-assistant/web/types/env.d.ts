declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // AWS環境変数
      readonly AWS_REGION: string;
      readonly DYNAMODB_TABLE_NAME: string;
      readonly BATCH_JOB_QUEUE: string;
      readonly BATCH_JOB_DEFINITION: string;

      // NextAuth設定
      readonly AUTH_SECRET: string;
      readonly NEXT_PUBLIC_AUTH_URL: string;
      readonly APP_URL: string;
      readonly APP_VERSION: string;

      // Next.js環境変数
      readonly NODE_ENV: 'development' | 'production' | 'test';
      readonly PORT?: string;
    }
  }
}

export {};
