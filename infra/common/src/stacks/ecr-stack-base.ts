import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrConfig } from '../types/ecr-config';
import { Environment } from '../types/environment';
import { getEcrRepositoryName } from '../utils/naming';
import { DEFAULT_ECR_CONFIG, mergeConfig } from '../constants/defaults';

/**
 * ECRStackBase のプロパティ
 */
export interface EcrStackBaseProps extends cdk.StackProps {
  /**
   * サービス名（例: tools, auth, admin）
   */
  serviceName: string;

  /**
   * 環境（dev または prod）
   */
  environment: Environment;

  /**
   * ECR 設定（オプショナル）
   */
  ecrConfig?: EcrConfig;
}

/**
 * ECR リポジトリの基本スタック
 *
 * すべてのサービスで共通利用できる ECR スタックの基本実装を提供します。
 *
 * ## 主な機能
 * - ECR リポジトリの作成
 * - イメージスキャン設定
 * - ライフサイクルポリシー（イメージ保持数）
 * - タグ管理
 * - CloudFormation Outputs
 *
 * ## カスタマイズポイント
 * - リポジトリ名（デフォルト: 命名規則に従って自動生成）
 * - イメージスキャン有効/無効（デフォルト: true）
 * - イメージ保持数（デフォルト: 10）
 * - イメージタグ可変性（デフォルト: MUTABLE）
 * - リソース削除ポリシー（デフォルト: 環境に基づいて自動設定）
 *
 * @example
 * ```typescript
 * // 基本的な使用例
 * const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
 *   serviceName: 'tools',
 *   environment: 'dev',
 * });
 *
 * // カスタマイズ例
 * const ecrStack = new EcrStackBase(app, 'AuthEcrStack', {
 *   serviceName: 'auth',
 *   environment: 'prod',
 *   ecrConfig: {
 *     maxImageCount: 20,
 *     imageScanOnPush: true,
 *   },
 * });
 * ```
 */
export class EcrStackBase extends cdk.Stack {
  /**
   * 作成された ECR リポジトリ
   */
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackBaseProps) {
    super(scope, id, props);

    const { serviceName, environment, ecrConfig } = props;

    // デフォルト設定とマージ
    const config = mergeConfig(ecrConfig, DEFAULT_ECR_CONFIG);

    // リポジトリ名（カスタム名が指定されていない場合は命名規則に従う）
    const repositoryName =
      ecrConfig?.repositoryName || getEcrRepositoryName(serviceName, environment);

    // リソース削除ポリシー（prod は RETAIN、dev は DESTROY）
    const removalPolicy =
      ecrConfig?.removalPolicy === 'RETAIN'
        ? cdk.RemovalPolicy.RETAIN
        : ecrConfig?.removalPolicy === 'DESTROY'
          ? cdk.RemovalPolicy.DESTROY
          : environment === 'prod'
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY;

    // イメージタグ可変性
    const imageTagMutability =
      config.imageTagMutability === 'IMMUTABLE'
        ? ecr.TagMutability.IMMUTABLE
        : ecr.TagMutability.MUTABLE;

    // CloudFormation論理ID（既存スタックとの互換性を保つため、カスタマイズ可能）
    const logicalId = ecrConfig?.logicalId || 'Repository';

    // ECR リポジトリの作成
    this.repository = new ecr.Repository(this, logicalId, {
      repositoryName,
      imageScanOnPush: config.imageScanOnPush,
      imageTagMutability,
      lifecycleRules: [
        {
          description: `Keep last ${config.maxImageCount} images`,
          maxImageCount: config.maxImageCount,
        },
      ],
      removalPolicy,
    });

    // タグの追加
    cdk.Tags.of(this.repository).add('Application', 'nagiyu');
    cdk.Tags.of(this.repository).add('Service', serviceName);
    cdk.Tags.of(this.repository).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `${this.stackName}-RepositoryUri`,
    });

    new cdk.CfnOutput(this, 'RepositoryArn', {
      value: this.repository.repositoryArn,
      description: 'ECR Repository ARN',
      exportName: `${this.stackName}-RepositoryArn`,
    });

    new cdk.CfnOutput(this, 'RepositoryName', {
      value: this.repository.repositoryName,
      description: 'ECR Repository Name',
      exportName: `${this.stackName}-RepositoryName`,
    });
  }
}
