declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Node.js環境変数
      readonly NODE_ENV: 'development' | 'production' | 'test' | 'dev' | 'prod';

      // アプリケーション設定
      readonly APP_VERSION?: string;

      // AWS環境変数
      readonly AWS_REGION?: string;
      readonly DYNAMODB_TABLE_NAME?: string;

      // NextAuth設定
      readonly AUTH_SECRET?: string;
      readonly NEXTAUTH_SECRET?: string;
      readonly NEXT_PUBLIC_AUTH_URL?: string;

      // Web Push (VAPID)
      readonly VAPID_PUBLIC_KEY?: string;
      readonly VAPID_PRIVATE_KEY?: string;

      // テスト環境設定
      readonly SKIP_AUTH_CHECK?: string;
      readonly TEST_USER_EMAIL?: string;
      readonly TEST_USER_ROLES?: string;

      // Playwright設定
      readonly CI?: string;
      readonly BASE_URL?: string;
      readonly PROJECT?: string;

      // リポジトリ種別（E2Eテスト用）
      readonly USE_IN_MEMORY_REPOSITORY?: string;
    }
  }
}

export {};
