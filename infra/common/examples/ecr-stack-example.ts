import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { getEcrRepositoryName, DEFAULT_ECR_CONFIG, mergeConfig } from '@nagiyu/infra-common';
import type { Environment, EcrConfig } from '@nagiyu/infra-common';

export interface EcrStackProps extends cdk.StackProps {
  serviceName: string;
  environment: Environment;
  config?: EcrConfig;
}

/**
 * ECR スタックの例
 *
 * @nagiyu/infra-common を使用した ECR リポジトリの作成例
 */
export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { serviceName, environment, config } = props;

    // ユーザー設定とデフォルト設定をマージ
    const ecrConfig = mergeConfig(config, DEFAULT_ECR_CONFIG);

    // 命名規則に従ったリポジトリ名を生成
    const repositoryName =
      ecrConfig.repositoryName || getEcrRepositoryName(serviceName, environment);

    // ECR リポジトリの作成
    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName,
      imageScanOnPush: ecrConfig.imageScanOnPush,
      imageTagMutability:
        ecrConfig.imageTagMutability === 'IMMUTABLE'
          ? ecr.TagMutability.IMMUTABLE
          : ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: `Keep last ${ecrConfig.maxImageCount} images`,
          maxImageCount: ecrConfig.maxImageCount,
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // タグの追加
    cdk.Tags.of(this.repository).add('Application', 'nagiyu');
    cdk.Tags.of(this.repository).add('Service', serviceName);
    cdk.Tags.of(this.repository).add('Environment', environment);

    // Outputs
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

/**
 * 使用例
 */
// デフォルト設定で作成
const stack1 = new EcrStack(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  // config を省略すると全てデフォルト値が使用される
});

// カスタム設定で作成
const stack2 = new EcrStack(app, 'AuthEcrStack', {
  serviceName: 'auth',
  environment: 'prod',
  config: {
    maxImageCount: 20, // デフォルトの 10 から変更
    imageTagMutability: 'IMMUTABLE', // デフォルトの MUTABLE から変更
    // imageScanOnPush は省略しているのでデフォルト値 (true) を使用
  },
});
