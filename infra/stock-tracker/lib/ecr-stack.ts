import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface EcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stock Tracker ECR Stack
 *
 * Web Lambda と Batch Lambda 用の2つの ECR リポジトリを作成します。
 */
export class EcrStack extends cdk.Stack {
  public readonly webRepository: ecr.Repository;
  public readonly batchRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // リソース削除ポリシー（prod は RETAIN、dev は DESTROY）
    const removalPolicy =
      environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // Web Lambda 用 ECR リポジトリ
    this.webRepository = new ecr.Repository(this, 'WebRepository', {
      repositoryName: `stock-tracker-web-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy,
    });

    // Batch Lambda 用 ECR リポジトリ
    this.batchRepository = new ecr.Repository(this, 'BatchRepository', {
      repositoryName: `stock-tracker-batch-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy,
    });

    // タグの追加
    [this.webRepository, this.batchRepository].forEach((repo) => {
      cdk.Tags.of(repo).add('Application', 'nagiyu');
      cdk.Tags.of(repo).add('Service', 'stock-tracker');
      cdk.Tags.of(repo).add('Environment', environment);
    });

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
