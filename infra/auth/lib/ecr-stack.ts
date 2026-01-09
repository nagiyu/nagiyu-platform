import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

export class ECRStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: ECRStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ECR リポジトリ
    this.repository = new ecr.Repository(this, 'AuthRepository', {
      repositoryName: `nagiyu-auth-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // タグ
    cdk.Tags.of(this.repository).add('Application', 'nagiyu');
    cdk.Tags.of(this.repository).add('Service', 'auth');
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
