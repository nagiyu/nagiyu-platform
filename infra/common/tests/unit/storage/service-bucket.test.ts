import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { createServiceBucket } from '../../../src/storage/service-bucket';

describe('createServiceBucket', () => {
  let stack: cdk.Stack;

  beforeEach(() => {
    stack = new cdk.Stack(new cdk.App(), 'TestStack');
  });

  it('SSE-S3 暗号化を設定する', () => {
    createServiceBucket(stack, 'Bucket', {});

    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
    });
  });

  it('パブリックアクセスを全面ブロックする', () => {
    createServiceBucket(stack, 'Bucket', {});

    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('HTTP アクセスを拒否するバケットポリシーを付ける', () => {
    createServiceBucket(stack, 'Bucket', {});

    Template.fromStack(stack).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Action: 's3:*',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('渡したプロパティをそのまま反映する', () => {
    createServiceBucket(stack, 'Bucket', {
      bucketName: 'nagiyu-test-bucket',
      lifecycleRules: [{ id: 'Expire', enabled: true, expiration: cdk.Duration.days(3) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-test-bucket',
      LifecycleConfiguration: {
        Rules: [{ Id: 'Expire', Status: 'Enabled', ExpirationInDays: 3 }],
      },
    });
    template.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });
});
