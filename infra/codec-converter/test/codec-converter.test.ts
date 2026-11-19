import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CodecConverter from '../lib/codec-converter-stack';

// CloudFormation テンプレート上の Batch ResourceRequirements の要素
type ResourceRequirement = { Type: string; Value: string };

// Helper function to create a test stack with required environment
function createTestStack(context: Record<string, string> = {}): {
  app: cdk.App;
  stack: cdk.Stack;
} {
  const app = new cdk.App({
    context: {
      vpcId: 'vpc-12345678', // Mock VPC ID for testing
      ...context,
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

test('S3 Bucket denies non-HTTPS access', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Deny',
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        }),
      ]),
    },
  });
});

test('DynamoDB Table Created', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
      AttributeName: 'TTL',
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
      const vcpuReq = resourceReqs.find((r: ResourceRequirement) => r.Type === 'VCPU');
      const memoryReq = resourceReqs.find((r: ResourceRequirement) => r.Type === 'MEMORY');
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
            Match.stringLikeRegexp('.*job-definition/nagiyu-codec-converter-.*-\\*'),
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

test('セキュリティヘッダーと X-Robots-Tag: noindex, nofollow を持つヘッダーポリシーが作成される', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
    ResponseHeadersPolicyConfig: Match.objectLike({
      Name: Match.stringLikeRegexp('nagiyu-codec-converter-security-headers-.*'),
      SecurityHeadersConfig: Match.objectLike({
        StrictTransportSecurity: Match.objectLike({
          AccessControlMaxAgeSec: 63072000,
          IncludeSubdomains: true,
          Preload: true,
          Override: true,
        }),
        ContentTypeOptions: { Override: true },
        FrameOptions: { FrameOption: 'DENY', Override: true },
      }),
      CustomHeadersConfig: {
        Items: Match.arrayWith([
          {
            Header: 'X-Robots-Tag',
            Value: 'noindex, nofollow',
            Override: true,
          },
        ]),
      },
    }),
  });
});

test('CloudFront の全 behavior にセキュリティヘッダーポリシーが適用される', () => {
  const { stack } = createTestStack();
  const template = Template.fromStack(stack);

  const policyRef = Match.objectLike({
    Ref: Match.stringLikeRegexp('^SecurityHeadersPolicy'),
  });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({ ResponseHeadersPolicyId: policyRef }),
      CacheBehaviors: Match.arrayEquals([
        Match.objectLike({ ResponseHeadersPolicyId: policyRef }),
        Match.objectLike({ ResponseHeadersPolicyId: policyRef }),
        Match.objectLike({ ResponseHeadersPolicyId: policyRef }),
      ]),
    }),
  });
});

describe('環境による分岐', () => {
  test('dev 環境では dev アカウントの Route53 ゾーンへ CloudFront 向け ALIAS レコードが作成される', () => {
    const { stack } = createTestStack({ env: 'dev' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: Match.anyValue(),
      Type: 'A',
      AliasTarget: Match.objectLike({
        DNSName: Match.anyValue(),
      }),
    });
  });

  test('prod 環境では ALIAS レコードを作成しない', () => {
    const { stack } = createTestStack({ env: 'prod' });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Route53::RecordSet', 0);
  });

  test('prod 環境では環境名がリソース名に反映される', () => {
    const { stack } = createTestStack({ env: 'prod' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-codec-converter-storage-prod',
    });
    template.hasResourceProperties('AWS::Batch::JobQueue', {
      JobQueueName: 'nagiyu-codec-converter-prod',
    });
  });
});

describe('イメージのタグと ECR リポジトリ', () => {
  const originalImageTag = process.env.IMAGE_TAG;

  afterEach(() => {
    if (originalImageTag === undefined) {
      delete process.env.IMAGE_TAG;
    } else {
      process.env.IMAGE_TAG = originalImageTag;
    }
  });

  // Fn::Join で組み立てられるイメージ URI を文字列に直して比較する
  function flatten(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && 'Fn::Join' in value) {
      const [separator, parts] = (value as { 'Fn::Join': [string, unknown[]] })['Fn::Join'];
      return parts.map((part) => (typeof part === 'string' ? part : '${ref}')).join(separator);
    }
    return '${ref}';
  }

  test('IMAGE_TAG を指定すると Lambda と Batch ジョブ定義が新しいリポジトリのそのタグを指す', () => {
    process.env.IMAGE_TAG = 'abc123';
    const { stack } = createTestStack({ env: 'dev' });
    const template = Template.fromStack(stack);

    const functions = Object.values(template.findResources('AWS::Lambda::Function')).filter(
      (resource) => resource.Properties.PackageType === 'Image'
    );
    expect(functions).toHaveLength(1);
    expect(flatten(functions[0].Properties.Code.ImageUri)).toMatch(
      /nagiyu-codec-converter-ecr-dev:abc123$/
    );

    const jobDefs = Object.values(template.findResources('AWS::Batch::JobDefinition'));
    expect(jobDefs).toHaveLength(4);
    for (const jobDef of jobDefs) {
      expect(flatten(jobDef.Properties.ContainerProperties.Image)).toMatch(
        /nagiyu-codec-converter-batch-ecr-dev:abc123$/
      );
    }
  });

  test('IMAGE_TAG が無いときは latest を指す', () => {
    delete process.env.IMAGE_TAG;
    const { stack } = createTestStack({ env: 'prod' });
    const template = Template.fromStack(stack);

    const jobDefs = Object.values(template.findResources('AWS::Batch::JobDefinition'));
    for (const jobDef of jobDefs) {
      expect(flatten(jobDef.Properties.ContainerProperties.Image)).toMatch(
        /nagiyu-codec-converter-batch-ecr-prod:latest$/
      );
    }
  });

  test('本体のスタックは ECR リポジトリを作らない', () => {
    const { stack } = createTestStack();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::ECR::Repository', 0);
  });
});
