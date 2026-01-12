/**
 * CloudFront distribution configuration
 */
export interface CloudFrontConfig {
  /**
   * ドメイン名（指定しない場合は命名規則に従って自動生成）
   */
  domainName?: string;

  /**
   * セキュリティヘッダーを有効にするか
   * @default true
   */
  enableSecurityHeaders?: boolean;

  /**
   * 最小 TLS バージョン
   * @default 1.2
   */
  minimumTlsVersion?: '1.2' | '1.3';

  /**
   * HTTP/2 を有効にするか
   * @default true
   */
  enableHttp2?: boolean;

  /**
   * HTTP/3 を有効にするか
   * @default true
   */
  enableHttp3?: boolean;

  /**
   * 価格クラス
   * @default PriceClass_100
   */
  priceClass?: string;

  /**
   * カスタム動作の追加設定
   */
  additionalBehaviors?: Record<string, unknown>;
}
