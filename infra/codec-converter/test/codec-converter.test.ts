import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CodecConverter from '../lib/codec-converter-stack';

// Helper function to create a test stack with required environment
function createTestStack(): { app: cdk.App; stack: cdk.Stack } {
  const app = new cdk.App({
    context: {
      vpcId: 'vpc-12345678', // Mock VPC ID for testing
    },
  });
  const stack = new CodecConverter.CodecConverterStack(app, 'TestStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
  return { app, stack };
}

test('S3 Bucket Created', () => {
  const { stack } = createTestStack();
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
  const { stack } = createTestStack();
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
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    MemorySize: 1024,
    Timeout: 30,
    PackageType: 'Image',
  });
});

test('Lambda Function URL Created', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Url', {
    AuthType: 'NONE',
  });
});

test('CloudFront Distribution Created', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
});

test('Lambda has correct IAM permissions', () => {
  const { stack } = createTestStack();
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

test('Batch Worker ECR Repository Created with image scanning', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ECR::Repository', {
    ImageScanningConfiguration: {
      ScanOnPush: true,
    },
    LifecyclePolicy: {
      LifecyclePolicyText: Match.stringLikeRegexp('.*countNumber.*10.*'),
    },
  });
});

test('Batch Compute Environment Created with correct configuration', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Batch::ComputeEnvironment', {
    Type: 'managed',
    ComputeResources: {
      MaxvCpus: 6,
      Type: 'FARGATE',
    },
  });
});

test('Batch Job Queue Created', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Batch::JobQueue', {
    Priority: 1,
  });
});

test('Batch Job Definition Created with correct resources', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  // Just verify the resource exists and has basic properties
  template.resourceCountIs('AWS::Batch::JobDefinition', 1);
  
  const jobDefResource = template.findResources('AWS::Batch::JobDefinition');
  const jobDef = Object.values(jobDefResource)[0];
  
  expect(jobDef.Properties.Type).toBe('container');
  expect(jobDef.Properties.PlatformCapabilities).toContain('FARGATE');
  expect(jobDef.Properties.Timeout.AttemptDurationSeconds).toBe(7200);
  
  // Check resource requirements contain both VCPU and MEMORY
  const resourceReqs = jobDef.Properties.ContainerProperties.ResourceRequirements;
  const vcpuReq = resourceReqs.find((r: any) => r.Type === 'VCPU');
  const memoryReq = resourceReqs.find((r: any) => r.Type === 'MEMORY');
  
  expect(vcpuReq.Value).toBe('2');
  expect(memoryReq.Value).toBe('4096');
});

test('Lambda has Batch permissions', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  // Check for Batch SubmitJob permission
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'batch:SubmitJob',
          Effect: 'Allow',
        }),
      ]),
    },
  });

  // Check for Batch DescribeJobs and TerminateJob permissions
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: ['batch:DescribeJobs', 'batch:TerminateJob'],
          Effect: 'Allow',
          Resource: '*',
        }),
      ]),
    },
  });
});
