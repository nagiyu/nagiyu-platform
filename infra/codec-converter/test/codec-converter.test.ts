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

test('Lambda has correct environment variables for Batch', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  // Lambda should have BATCH_JOB_DEFINITION_PREFIX instead of BATCH_JOB_DEFINITION
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        BATCH_JOB_DEFINITION_PREFIX: Match.stringLikeRegexp('codec-converter-.*'),
        BATCH_JOB_QUEUE: Match.stringLikeRegexp('codec-converter-.*'),
      }),
    },
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

test('Batch Compute Environment Created with correct configuration', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Batch::ComputeEnvironment', {
    Type: 'MANAGED',
    ComputeResources: {
      MaxvCpus: 16, // Updated from 6 to 16 for dynamic resource allocation
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

test('Batch Job Definitions Created with correct resources', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  // Should have 4 job definitions (small, medium, large, xlarge)
  template.resourceCountIs('AWS::Batch::JobDefinition', 4);

  const jobDefResources = template.findResources('AWS::Batch::JobDefinition');
  const jobDefs = Object.values(jobDefResources);

  // All job definitions should have common properties
  jobDefs.forEach((jobDef) => {
    expect(jobDef.Properties.Type).toBe('container');
    expect(jobDef.Properties.PlatformCapabilities).toContain('FARGATE');
    expect(jobDef.Properties.Timeout.AttemptDurationSeconds).toBe(7200);
  });

  // Expected resource configurations
  const expectedConfigs = [
    { size: 'small', vcpu: '1', memory: '2048' },
    { size: 'medium', vcpu: '2', memory: '4096' },
    { size: 'large', vcpu: '4', memory: '8192' },
    { size: 'xlarge', vcpu: '4', memory: '16384' },
  ];

  // Verify each job definition has the correct resources
  expectedConfigs.forEach((expectedConfig) => {
    const matchingJobDef = jobDefs.find((jobDef) => {
      const resourceReqs = jobDef.Properties.ContainerProperties.ResourceRequirements;
      const vcpuReq = resourceReqs.find((r: any) => r.Type === 'VCPU');
      const memoryReq = resourceReqs.find((r: any) => r.Type === 'MEMORY');
      return vcpuReq.Value === expectedConfig.vcpu && memoryReq.Value === expectedConfig.memory;
    });

    expect(matchingJobDef).toBeDefined();
  });
});

test('Lambda has Batch permissions', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  // Check for Batch SubmitJob permission with wildcard pattern for multiple job definitions
  template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: 'batch:SubmitJob',
          Effect: 'Allow',
          Resource: Match.arrayWith([
            Match.stringLikeRegexp('.*job-definition/codec-converter-.*-\\*'),
          ]),
        }),
      ]),
    },
  });

  // Check for Batch DescribeJobs and TerminateJob permissions in ManagedPolicy
  template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
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
