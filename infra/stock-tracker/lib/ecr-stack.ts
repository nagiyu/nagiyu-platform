import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface EcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stock Tracker ECR Stack
 *
 * Web Lambda と Batch Lambda 用の2つの ECR リポジトリを作成します。
 * 共通基盤の EcrStackBase を使用してメンテナンス性を向上。
 */
export class EcrStack extends cdk.Stack {
  public readonly webRepository: ecr.Repository;
  public readonly batchRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Web Lambda 用 ECR リポジトリ (EcrStackBase を使用)
    const webEcrStack = new EcrStackBase(this, 'WebEcrStack', {
      serviceName: 'stock-tracker-web',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        repositoryName: `stock-tracker-web-${environment}`,
      },
    } as EcrStackBaseProps);
    this.webRepository = webEcrStack.repository;

    // Batch Lambda 用 ECR リポジトリ (EcrStackBase を使用)
    const batchEcrStack = new EcrStackBase(this, 'BatchEcrStack', {
      serviceName: 'stock-tracker-batch',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        repositoryName: `stock-tracker-batch-${environment}`,
      },
    } as EcrStackBaseProps);
    this.batchRepository = batchEcrStack.repository;

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'WebRepositoryUri', {
      value: this.webRepository.repositoryUri,
      description: 'Web Lambda ECR Repository URI',
      exportName: `${this.stackName}-WebRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'WebRepositoryArn', {
      value: this.webRepository.repositoryArn,
      description: 'Web Lambda ECR Repository ARN',
      exportName: `${this.stackName}-WebRepositoryArn`,
    });

    new cdk.CfnOutput(this, 'BatchRepositoryUri', {
      value: this.batchRepository.repositoryUri,
      description: 'Batch Lambda ECR Repository URI',
      exportName: `${this.stackName}-BatchRepositoryUri`,
    });

    new cdk.CfnOutput(this, 'BatchRepositoryArn', {
      value: this.batchRepository.repositoryArn,
      description: 'Batch Lambda ECR Repository ARN',
      exportName: `${this.stackName}-BatchRepositoryArn`,
    });
  }
}
