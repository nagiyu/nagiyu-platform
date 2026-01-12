import { EcrConfig } from "../types/ecr-config";
import { LambdaConfig } from "../types/lambda-config";
import { CloudFrontConfig } from "../types/cloudfront-config";

/**
 * Lambda のデフォルト設定
 */
export const DEFAULT_LAMBDA_CONFIG: Required<
  Omit<
    LambdaConfig,
    "functionName" | "environment" | "reservedConcurrentExecutions"
  >
> = {
  memorySize: 512,
  timeout: 30,
  architecture: "X86_64",
  runtime: "nodejs20.x",
};

/**
 * ECR のデフォルト設定
 */
export const DEFAULT_ECR_CONFIG: Required<
  Omit<EcrConfig, "repositoryName" | "removalPolicy">
> = {
  imageScanOnPush: true,
  maxImageCount: 10,
  imageTagMutability: "MUTABLE",
};

/**
 * CloudFront のデフォルト設定
 */
export const DEFAULT_CLOUDFRONT_CONFIG: Required<
  Omit<CloudFrontConfig, "domainName" | "additionalBehaviors">
> = {
  enableSecurityHeaders: true,
  minimumTlsVersion: "1.2",
  enableHttp2: true,
  enableHttp3: true,
  priceClass: "PriceClass_100",
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
