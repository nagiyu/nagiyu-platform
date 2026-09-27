import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/** バケット名未指定時の既定値（現行の prod 用バケット名） */
const DEFAULT_LOCK_BUCKET_NAME = 'nagiyu-docker-build-lock';

export interface DockerBuildLockStackProps extends cdk.StackProps {
  /** ロック用 S3 バケット名。未指定の場合は `nagiyu-docker-build-lock` を使う */
  bucketName?: string;
}

export class DockerBuildLockStack extends cdk.Stack {
  public readonly lockBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: DockerBuildLockStackProps) {
    super(scope, id, props);

    this.lockBucket = new s3.Bucket(this, 'DockerBuildLockBucket', {
      bucketName: props?.bucketName ?? DEFAULT_LOCK_BUCKET_NAME,
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
