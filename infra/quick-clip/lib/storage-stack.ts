import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { QuickClipEnvironment } from './environment';

export interface StorageStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

export class StorageStack extends cdk.Stack {
  public readonly storageBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const allowedOrigins =
      props.environment === 'prod'
        ? ['https://quick-clip.nagiyu.com']
        : ['https://dev-quick-clip.nagiyu.com'];

    this.storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: `nagiyu-quick-clip-storage-${props.environment}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ enabled: true, expiration: cdk.Duration.days(1) }],
      cors: [
        {
          allowedOrigins,
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new cdk.CfnOutput(this, 'StorageBucketName', {
      value: this.storageBucket.bucketName,
    });
  }
}
