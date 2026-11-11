import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { EcrConfig } from '../types/ecr-config';
import { LambdaConfig } from '../types/lambda-config';
import { CloudFrontConfig } from '../types/cloudfront-config';

/**
 * Lambda のデフォルト設定
 */
export const DEFAULT_LAMBDA_CONFIG: Required<
  Omit<
    LambdaConfig,
    | 'functionName'
    | 'environment'
    | 'reservedConcurrentExecutions'
    | 'logicalId'
    | 'executionRoleName'
    | 'adoptExistingLogGroup'
  >
> = {
  memorySize: 512,
  timeout: 30,
  architecture: 'X86_64',
};

/**
 * Lambda のログ保持期間の既定値
 *
 * 全サービス・全環境で揃える。サービスごとに変えると、障害調査で遡れる期間が
 * サービス間でずれるため。
 */
export const DEFAULT_LAMBDA_LOG_RETENTION = logs.RetentionDays.ONE_MONTH;

/**
 * Lambda の X-Ray トレーシングの既定値
 */
export const DEFAULT_LAMBDA_TRACING = lambda.Tracing.ACTIVE;

/**
 * ECR のデフォルト設定
 */
export const DEFAULT_ECR_CONFIG: Required<
  Omit<EcrConfig, 'repositoryName' | 'removalPolicy' | 'logicalId'>
> = {
  imageScanOnPush: true,
  maxImageCount: 10,
  imageTagMutability: 'MUTABLE',
};

/**
 * CloudFront のデフォルト設定
 */
export const DEFAULT_CLOUDFRONT_CONFIG: Required<
  Omit<CloudFrontConfig, 'domainName' | 'additionalBehaviors' | 'logicalId'>
> = {
  enableSecurityHeaders: true,
  minimumTlsVersion: '1.2',
  enableHttp2: true,
  enableHttp3: true,
  priceClass: 'PriceClass_100',
  noindex: false,
};

/**
 * 設定をマージしてデフォルト値を適用
 *
 * @param config - ユーザー設定
 * @param defaults - デフォルト設定
 * @returns マージされた設定
 */
export function mergeConfig<T>(config: Partial<T> | undefined, defaults: T): T {
  return {
    ...defaults,
    ...(config || {}),
  };
}
