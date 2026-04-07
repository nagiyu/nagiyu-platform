import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface EcrStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

export class EcrStack extends EcrStackBase {
  public readonly batchRepository: ecr.Repository;
  public readonly clipLambdaRepository: ecr.Repository;
  public readonly zipLambdaRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
    };

    super(scope, id, baseProps);

    this.batchRepository = new ecr.Repository(this, 'BatchRepository', {
      repositoryName: `nagiyu-quick-clip-batch-ecr-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.clipLambdaRepository = new ecr.Repository(this, 'ClipLambdaRepository', {
      repositoryName: `nagiyu-quick-clip-lambda-clip-ecr-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.zipLambdaRepository = new ecr.Repository(this, 'ZipLambdaRepository', {
      repositoryName: `nagiyu-quick-clip-lambda-zip-ecr-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'BatchRepositoryUri', {
      value: this.batchRepository.repositoryUri,
      description: 'Batch ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'BatchRepositoryName', {
      value: this.batchRepository.repositoryName,
      description: 'Batch ECR Repository Name',
    });

    new cdk.CfnOutput(this, 'ClipLambdaRepositoryUri', {
      value: this.clipLambdaRepository.repositoryUri,
      description: 'Clip Lambda ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'ClipLambdaRepositoryName', {
      value: this.clipLambdaRepository.repositoryName,
      description: 'Clip Lambda ECR Repository Name',
    });

    new cdk.CfnOutput(this, 'ZipLambdaRepositoryUri', {
      value: this.zipLambdaRepository.repositoryUri,
      description: 'Zip Lambda ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'ZipLambdaRepositoryName', {
      value: this.zipLambdaRepository.repositoryName,
      description: 'Zip Lambda ECR Repository Name',
    });
  }
}
