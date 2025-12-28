import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as CodecConverter from '../lib/codec-converter-stack';

test('S3 Bucket Created', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        {
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256',
          },
        },
      ],
    },
  });
});

test('DynamoDB Table Created', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
      AttributeName: 'expiresAt',
      Enabled: true,
    },
  });
});

test('Lambda Function Created with correct configuration', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    MemorySize: 1024,
    Timeout: 30,
    PackageType: 'Image',
  });
});

test('Lambda Function URL Created', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'NONE',
  });
});

test('CloudFront Distribution Created', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});

test('Lambda has correct IAM permissions', () => {
  const app = new cdk.App();
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack');
  const template = Template.fromStack(stack);

  // Check that Lambda execution role exists
  template.hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
        },
      ],
    },
  });
});
