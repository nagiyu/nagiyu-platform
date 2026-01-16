import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { CloudFrontConfig } from '../types/cloudfront-config';
import { Environment } from '../types/environment';
import { getCloudFrontDomainName } from '../utils/naming';
import { DEFAULT_CLOUDFRONT_CONFIG, mergeConfig } from '../constants/defaults';
import { SECURITY_HEADERS } from '../constants/security-headers';

/**
 * CloudFrontStackBase のプロパティ
 */
export interface CloudFrontStackBaseProps extends cdk.StackProps {
  /**
   * サービス名（例: tools, auth, admin）
   */
  serviceName: string;

  /**
   * 環境（dev または prod）
   */
  environment: Environment;

  /**
   * Lambda Function URL（オリジンとして使用）
   */
  functionUrl: string;

  /**
   * CloudFront 設定（オプショナル）
   */
  cloudfrontConfig?: CloudFrontConfig;

  /**
   * ACM 証明書 ARN
   * 指定しない場合は共有インフラからインポート
   */
  certificateArn?: string;

  /**
   * キャッシュポリシー
   * @default CACHING_DISABLED
   */
  cachePolicy?: cloudfront.ICachePolicy;

  /**
   * オリジンリクエストポリシー
   * @default ALL_VIEWER_EXCEPT_HOST_HEADER
   */
  originRequestPolicy?: cloudfront.IOriginRequestPolicy;
}

/**
 * CloudFront ディストリビューションの基本スタック
 *
 * すべてのサービスで共通利用できる CloudFront スタックの基本実装を提供します。
 *
 * ## 主な機能
 * - CloudFront ディストリビューションの作成
 * - Lambda Function URL オリジン設定
 * - セキュリティヘッダーポリシーの作成
 * - ACM 証明書の参照
 * - カスタムドメイン設定
 * - TLS 1.2 以上の強制
 * - HTTP/2 および HTTP/3 サポート
 *
 * ## カスタマイズポイント
 * - ドメイン名（デフォルト: 命名規則に従って自動生成）
 * - セキュリティヘッダー有効/無効（デフォルト: true）
 * - 最小 TLS バージョン（デフォルト: 1.2）
 * - HTTP/2, HTTP/3 有効/無効（デフォルト: 両方とも true）
 * - 価格クラス（デフォルト: PriceClass_100）
 * - キャッシュポリシー（デフォルト: CACHING_DISABLED）
 * - オリジンリクエストポリシー（デフォルト: ALL_VIEWER_EXCEPT_HOST_HEADER）
 *
 * @example
 * ```typescript
 * // 基本的な使用例
 * const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
 *   serviceName: 'tools',
 *   environment: 'dev',
 *   functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
 * });
 *
 * // カスタマイズ例
 * const cloudfrontStack = new CloudFrontStackBase(app, 'AuthCloudFrontStack', {
 *   serviceName: 'auth',
 *   environment: 'prod',
 *   functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
 *   cloudfrontConfig: {
 *     enableSecurityHeaders: true,
 *     minimumTlsVersion: '1.3',
 *     priceClass: 'PriceClass_All',
 *   },
 *   cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
 * });
 * ```
 */
export class CloudFrontStackBase extends cdk.Stack {
  /**
   * 作成された CloudFront ディストリビューション
   */
  public readonly distribution: cloudfront.Distribution;

  /**
   * レスポンスヘッダーポリシー（セキュリティヘッダー有効時）
   */
  public readonly responseHeadersPolicy?: cloudfront.ResponseHeadersPolicy;

  constructor(scope: Construct, id: string, props: CloudFrontStackBaseProps) {
    super(scope, id, props);

    const {
      serviceName,
      environment,
      functionUrl,
      cloudfrontConfig,
      certificateArn,
      cachePolicy,
      originRequestPolicy,
    } = props;

    // デフォルト設定とマージ
    const config = mergeConfig(cloudfrontConfig, DEFAULT_CLOUDFRONT_CONFIG);

    // ドメイン名（カスタム名が指定されていない場合は命名規則に従う）
    const domainName =
      cloudfrontConfig?.domainName || getCloudFrontDomainName(serviceName, environment);

    // Lambda 関数 URL から https:// を除去してドメイン名を取得
    // CDK Token の場合は Fn::Select を使用
    const functionUrlDomain = cdk.Fn.select(1, cdk.Fn.split('//', functionUrl));
    const cleanFunctionUrlDomain = cdk.Fn.select(0, cdk.Fn.split('/', functionUrlDomain));

    // ACM 証明書の参照
    const certArn = certificateArn || cdk.Fn.importValue('nagiyu-shared-acm-certificate-arn');
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certArn);

    // セキュリティヘッダーポリシーの作成
    if (config.enableSecurityHeaders) {
      this.responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
        this,
        'SecurityHeadersPolicy',
        {
          responseHeadersPolicyName: `nagiyu-${serviceName}-security-headers-${environment}`,
          comment: `Security headers for ${serviceName} service (${environment})`,
          securityHeadersBehavior: {
            strictTransportSecurity: {
              accessControlMaxAge: cdk.Duration.seconds(
                SECURITY_HEADERS.strictTransportSecurity.accessControlMaxAge
              ),
              includeSubdomains: SECURITY_HEADERS.strictTransportSecurity.includeSubdomains,
              preload: SECURITY_HEADERS.strictTransportSecurity.preload,
              override: SECURITY_HEADERS.strictTransportSecurity.override,
            },
            contentTypeOptions: {
              override: SECURITY_HEADERS.contentTypeOptions.override,
            },
            frameOptions: {
              frameOption: cloudfront.HeadersFrameOption.DENY,
              override: SECURITY_HEADERS.frameOptions.override,
            },
            xssProtection: {
              protection: SECURITY_HEADERS.xssProtection.protection,
              modeBlock: SECURITY_HEADERS.xssProtection.modeBlock,
              override: SECURITY_HEADERS.xssProtection.override,
            },
            referrerPolicy: {
              referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
              override: SECURITY_HEADERS.referrerPolicy.override,
            },
          },
        }
      );
    }

    // TLS バージョンの設定
    const minimumProtocolVersion =
      config.minimumTlsVersion === '1.3'
        ? cloudfront.SecurityPolicyProtocol.TLS_V1_3_2025
        : cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021;

    // HTTP バージョンの設定
    const httpVersion = config.enableHttp3
      ? cloudfront.HttpVersion.HTTP2_AND_3
      : config.enableHttp2
        ? cloudfront.HttpVersion.HTTP2
        : cloudfront.HttpVersion.HTTP1_1;

    // 価格クラスの設定
    const priceClass =
      config.priceClass === 'PriceClass_All'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : config.priceClass === 'PriceClass_200'
          ? cloudfront.PriceClass.PRICE_CLASS_200
          : cloudfront.PriceClass.PRICE_CLASS_100;

    // CloudFormation論理ID（既存スタックとの互換性を保つため、カスタマイズ可能）
    const logicalId = cloudfrontConfig?.logicalId || 'Distribution';

    // CloudFront ディストリビューション
    this.distribution = new cloudfront.Distribution(this, logicalId, {
      comment: `${serviceName} Service Distribution (${environment})`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(cleanFunctionUrlDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cachePolicy || cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          originRequestPolicy || cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: this.responseHeadersPolicy,
        compress: true,
      },
      domainNames: [domainName],
      certificate: certificate,
      minimumProtocolVersion,
      httpVersion,
      enableIpv6: true,
      priceClass,
    });

    // タグの追加
    cdk.Tags.of(this.distribution).add('Application', 'nagiyu');
    cdk.Tags.of(this.distribution).add('Service', serviceName);
    cdk.Tags.of(this.distribution).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${this.stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${this.stackName}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: domainName,
      description: 'Custom Domain Name',
      exportName: `${this.stackName}-CustomDomainName`,
    });
  }
}
