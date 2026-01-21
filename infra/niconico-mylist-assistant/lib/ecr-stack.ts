import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * niconico-mylist-assistant サービス用の ECR スタック
 * web パッケージ用と batch パッケージ用の 2 つの ECR リポジトリを作成
 */
export class ECRStack extends cdk.Stack {
  public readonly webRepository: cdk.aws_ecr.IRepository;
  public readonly batchRepository: cdk.aws_ecr.IRepository;

  constructor(scope: Construct, id: string, props: ECRStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // web パッケージ用 ECR リポジトリ
    const webEcrStack = new EcrStackBase(this, 'WebECR', {
      serviceName: 'niconico-mylist-assistant-web',
      environment: environment as 'dev' | 'prod',
    });

    this.webRepository = webEcrStack.repository;

    // batch パッケージ用 ECR リポジトリ (Phase 3 で使用)
    const batchEcrStack = new EcrStackBase(this, 'BatchECR', {
      serviceName: 'niconico-mylist-assistant-batch',
      environment: environment as 'dev' | 'prod',
    });

    this.batchRepository = batchEcrStack.repository;

    // Outputs
    new cdk.CfnOutput(this, 'WebRepositoryName', {
      value: this.webRepository.repositoryName,
      description: 'ECR Repository Name for Web',
      exportName: `${this.stackName}-WebRepositoryName`,
    });

    new cdk.CfnOutput(this, 'WebRepositoryUri', {
      value: this.webRepository.repositoryUri,
      description: 'ECR Repository URI for Web',
      exportName: `${this.stackName}-WebRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'BatchRepositoryName', {
      value: this.batchRepository.repositoryName,
      description: 'ECR Repository Name for Batch',
      exportName: `${this.stackName}-BatchRepositoryName`,
    });

    new cdk.CfnOutput(this, 'BatchRepositoryUri', {
      value: this.batchRepository.repositoryUri,
      description: 'ECR Repository URI for Batch',
      exportName: `${this.stackName}-BatchRepositoryUri`,
    });
  }
}
