import { Environment } from './environment';
import { EcrConfig } from './ecr-config';
import { LambdaConfig } from './lambda-config';
import { CloudFrontConfig } from './cloudfront-config';

/**
 * サービス全体の設定
 */
export interface ServiceConfig {
  /**
   * サービス名（例: tools, auth, admin）
   */
  serviceName: string;

  /**
   * デプロイ環境
   */
  environment: Environment;

  /**
   * ECR リポジトリ設定
   */
  ecr?: EcrConfig;

  /**
   * Lambda 関数設定
   */
  lambda?: LambdaConfig;

  /**
   * CloudFront ディストリビューション設定
   */
  cloudfront?: CloudFrontConfig;
}
