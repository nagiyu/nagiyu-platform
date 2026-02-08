/**
 * Playwright 自動化スクリプトの型定義
 */

/**
 * マイリスト登録ジョブのパラメータ
 */
export interface MylistRegistrationJobParams {
  /** バッチジョブID (AWS Batch Job ID) */
  jobId: string;
  /** ユーザーID */
  userId: string;
  /** ニコニコ動画のメールアドレス */
  niconicoEmail: string;
  /** ニコニコ動画のパスワード（暗号化済み） */
  encryptedPassword: string;
  /** マイリスト名 */
  mylistName: string;
  /** 登録する動画IDのリスト */
  videoIds: string[];
}

/**
 * マイリスト登録の結果
 */
export interface MylistRegistrationResult {
  /** 成功した動画ID */
  successVideoIds: string[];
  /** 失敗した動画ID */
  failedVideoIds: string[];
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
}

/**
 * リトライ設定
 */
export interface RetryConfig {
  /** 最大リトライ回数 */
  maxRetries: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay: number;
}
