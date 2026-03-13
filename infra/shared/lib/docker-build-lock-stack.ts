import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class DockerBuildLockStack extends cdk.Stack {
  public readonly lockBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.lockBucket = new s3.Bucket(this, 'DockerBuildLockBucket', {
      bucketName: 'nagiyu-docker-build-lock',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldLocks',
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
    });
  }
}
