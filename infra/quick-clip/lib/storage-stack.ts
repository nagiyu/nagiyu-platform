import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { createServiceBucket, getServiceUrl } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface StorageStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

export class StorageStack extends cdk.Stack {
  public readonly storageBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const allowedOrigins = [getServiceUrl('quick-clip', props.environment)];

    this.storageBucket = createServiceBucket(this, 'StorageBucket', {
      bucketName: `nagiyu-quick-clip-storage-${props.environment}`,
      lifecycleRules: [{ enabled: true, expiration: cdk.Duration.days(1) }],
      cors: [
        {
          allowedOrigins,
          allowedMethods: [s3.HttpMethods.PUT],
          allowedHeaders: ['Content-Type', 'x-amz-*'],
          exposedHeaders: ['ETag'],
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
