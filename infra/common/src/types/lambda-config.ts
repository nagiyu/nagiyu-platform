/**
 * Lambda function configuration
 */
export interface LambdaConfig {
  /**
   * 関数名（指定しない場合は命名規則に従って自動生成）
   */
  functionName?: string;

  /**
   * CloudFormation論理ID（既存スタックとの互換性を保つために指定）
   * @default 'Function'
   */
  logicalId?: string;

  /**
   * 実行ロール名（指定しない場合は CloudFormation が自動生成）
   */
  executionRoleName?: string;

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

  /**
   * 既存のロググループを引き継ぐ。
   *
   * true のときは CloudFormation 管理の LogGroup を作らず、CDK の LogRetention
   * カスタムリソースで既存ロググループの保持期間だけを設定する。
   *
   * @deprecated 既存ロググループを引き継ぐ関数専用。新しく作る関数では付けない。
   * dev / prod には CloudFormation 管理外の同名ロググループが既にあり、LogGroup を
   * 作ると名前が衝突してデプロイが失敗するため、既存の関数だけがこの指定で回避している。
   * 新しい関数にはロググループが無いので、既定の LogGroup 作成で足りる。
   */
  adoptExistingLogGroup?: boolean;
}
