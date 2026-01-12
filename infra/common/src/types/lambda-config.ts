/**
 * Lambda function configuration
 */
export interface LambdaConfig {
  /**
   * 関数名（指定しない場合は命名規則に従って自動生成）
   */
  functionName?: string;

  /**
   * メモリサイズ (MB)
   * @default 512
   */
  memorySize?: number;

  /**
   * タイムアウト (秒)
   * @default 30
   */
  timeout?: number;

  /**
   * アーキテクチャ
   * @default X86_64
   */
  architecture?: 'X86_64' | 'ARM_64';

  /**
   * ランタイム
   * @default nodejs20.x
   */
  runtime?: string;

  /**
   * 環境変数
   */
  environment?: Record<string, string>;

  /**
   * 予約済み同時実行数
   */
  reservedConcurrentExecutions?: number;
}
