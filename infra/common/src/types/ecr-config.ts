/**
 * ECR repository configuration
 */
export interface EcrConfig {
  /**
   * リポジトリ名（指定しない場合は命名規則に従って自動生成）
   */
  repositoryName?: string;

  /**
   * イメージプッシュ時にスキャンを実行するか
   * @default true
   */
  imageScanOnPush?: boolean;

  /**
   * 保持するイメージの最大数
   * @default 10
   */
  maxImageCount?: number;

  /**
   * イメージタグの可変性
   * @default MUTABLE
   */
  imageTagMutability?: "MUTABLE" | "IMMUTABLE";

  /**
   * リソース削除ポリシーを上書き（通常は environment に基づいて自動設定）
   */
  removalPolicy?: "DESTROY" | "RETAIN";
}
