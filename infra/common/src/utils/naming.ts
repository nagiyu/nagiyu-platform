import { Environment } from '../types/environment';

/**
 * リソース種別
 */
export type ResourceType =
  | 'ecr'
  | 'lambda'
  | 'cloudfront'
  | 's3'
  | 'dynamodb'
  | 'iam-role'
  | 'iam-policy'
  | 'security-group'
  | 'log-group';

/**
 * リソース命名規則に従ったリソース名を生成
 * パターン: nagiyu-{service}-{type}-{env}
 *
 * @param serviceName - サービス名（例: tools, auth, admin）
 * @param resourceType - リソース種別
 * @param environment - 環境（dev または prod）
 * @returns 命名規則に従ったリソース名
 *
 * @example
 * ```typescript
 * getResourceName('tools', 'ecr', 'dev')
 * // => 'nagiyu-tools-ecr-dev'
 *
 * getResourceName('auth', 'lambda', 'prod')
 * // => 'nagiyu-auth-lambda-prod'
 * ```
 */
export function getResourceName(
  serviceName: string,
  resourceType: ResourceType,
  environment: Environment
): string {
  return `nagiyu-${serviceName}-${resourceType}-${environment}`;
}

/**
 * ECR リポジトリ名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns ECR リポジトリ名
 *
 * @example
 * ```typescript
 * getEcrRepositoryName('tools', 'dev')
 * // => 'nagiyu-tools-ecr-dev'
 * ```
 */
export function getEcrRepositoryName(serviceName: string, environment: Environment): string {
  return getResourceName(serviceName, 'ecr', environment);
}

/**
 * Lambda 関数名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns Lambda 関数名
 *
 * @example
 * ```typescript
 * getLambdaFunctionName('auth', 'prod')
 * // => 'nagiyu-auth-lambda-prod'
 * ```
 */
export function getLambdaFunctionName(serviceName: string, environment: Environment): string {
  return getResourceName(serviceName, 'lambda', environment);
}

/**
 * ルートドメイン名を生成
 *
 * dev のドメインは dev アカウントの Route53 ゾーン `dev.nagiyu.com`（prod ゾーンから
 * NS 委任済み）で完結させる。prod は従来どおり `nagiyu.com`。
 *
 * @param environment - 環境
 * @returns ルートドメイン名
 *
 * @example
 * ```typescript
 * getRootDomainName('prod')
 * // => 'nagiyu.com'
 *
 * getRootDomainName('dev')
 * // => 'dev.nagiyu.com'
 * ```
 */
export function getRootDomainName(environment: Environment): string {
  if (environment === 'prod') {
    return 'nagiyu.com';
  }
  return `${environment}.nagiyu.com`;
}

/**
 * CloudFront ドメイン名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns CloudFront ドメイン名
 *
 * @example
 * ```typescript
 * getCloudFrontDomainName('tools', 'prod')
 * // => 'tools.nagiyu.com'
 *
 * getCloudFrontDomainName('auth', 'dev')
 * // => 'auth.dev.nagiyu.com'
 * ```
 */
export function getCloudFrontDomainName(serviceName: string, environment: Environment): string {
  return `${serviceName}.${getRootDomainName(environment)}`;
}

/**
 * サービスの公開 URL（https://）を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns サービスの公開 URL
 *
 * @example
 * ```typescript
 * getServiceUrl('auth', 'prod')
 * // => 'https://auth.nagiyu.com'
 *
 * getServiceUrl('auth', 'dev')
 * // => 'https://auth.dev.nagiyu.com'
 * ```
 */
export function getServiceUrl(serviceName: string, environment: Environment): string {
  return `https://${getCloudFrontDomainName(serviceName, environment)}`;
}

/**
 * S3 バケット名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns S3 バケット名
 *
 * @example
 * ```typescript
 * getS3BucketName('tools', 'dev')
 * // => 'nagiyu-tools-s3-dev'
 * ```
 */
export function getS3BucketName(serviceName: string, environment: Environment): string {
  return getResourceName(serviceName, 's3', environment);
}

/**
 * DynamoDB テーブル名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns DynamoDB テーブル名
 *
 * @example
 * ```typescript
 * getDynamoDBTableName('auth', 'prod')
 * // => 'nagiyu-auth-dynamodb-prod'
 * ```
 */
export function getDynamoDBTableName(serviceName: string, environment: Environment): string {
  return getResourceName(serviceName, 'dynamodb', environment);
}

/**
 * IAM ロール名を生成
 *
 * @param serviceName - サービス名
 * @param environment - 環境
 * @returns IAM ロール名
 *
 * @example
 * ```typescript
 * getIamRoleName('tools', 'dev')
 * // => 'nagiyu-tools-iam-role-dev'
 * ```
 */
export function getIamRoleName(serviceName: string, environment: Environment): string {
  return getResourceName(serviceName, 'iam-role', environment);
}

/**
 * CloudWatch Logs ロググループ名を生成
 *
 * @param serviceName - サービ名
 * @param environment - 環境
 * @returns ロググループ名
 *
 * @example
 * ```typescript
 * getLogGroupName('tools', 'dev')
 * // => '/aws/lambda/nagiyu-tools-lambda-dev'
 * ```
 */
export function getLogGroupName(serviceName: string, environment: Environment): string {
  const functionName = getLambdaFunctionName(serviceName, environment);
  return `/aws/lambda/${functionName}`;
}
