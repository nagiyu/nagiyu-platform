import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import {
  DEFAULT_LAMBDA_LOG_RETENTION,
  DEFAULT_LAMBDA_TRACING,
  SSM_PARAMETERS,
  createBodyHashEdgeLambdas,
  createCloudFrontAliasRecord,
  createFunctionUrlOrigin,
  createResponseHeadersPolicy,
  createServiceBucket,
  grantCloudFrontInvoke,
  grantErrorEventsWrite,
  getEcrRepositoryName,
  getImageTag,
  importSharedVpc,
} from '@nagiyu/infra-common';
import { AppRuntimePolicy } from './policies/app-runtime-policy';
import { LambdaExecutionRole } from './roles/lambda-execution-role';
import { BatchJobRole } from './roles/batch-job-role';

import { BATCH_ECR_SERVICE_NAME, WEB_ECR_SERVICE_NAME } from './ecr-stacks';

export interface CodecConverterStackProps extends cdk.StackProps {
  appVersion?: string;
}

export class CodecConverterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: CodecConverterStackProps) {
    super(scope, id, props);

    // Environment name (default to 'dev')
    const envName = this.node.tryGetContext('env') || 'dev';
    const appVersion = props?.appVersion || '1.0.0';

    // ベースドメイン（SSM 共有パラメータ）。prod アカウントでは 'nagiyu.com'、
    // dev アカウントでは 'dev.nagiyu.com' が入る（アカウントごとに値が異なる）ため、
    // dev/prod で分岐せず同じ組み立て方（`codec-converter.${baseDomain}`）でよい。
    const baseDomain = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_DOMAIN_NAME
    );

    // CORS allowed origin (dev/prod 共通で baseDomain から組み立てる)
    const defaultOrigin = `https://codec-converter.${baseDomain}`;
    const allowedOrigin = this.node.tryGetContext('allowedOrigin') || defaultOrigin;

    // S3 Bucket for input/output files
    const storageBucket = createServiceBucket(this, 'StorageBucket', {
      bucketName: `nagiyu-codec-converter-storage-${envName}`,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldFiles',
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedOrigins: [allowedOrigin],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB Table for job management
    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `nagiyu-codec-converter-jobs-${envName}`,
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'TTL',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ECR リポジトリは別スタックが作る。名前は同じ関数から導き、スタック間の Export / Import は作らない。
    // 本体の更新でリポジトリの有無に依存させないため fromRepositoryName で参照する。
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      getEcrRepositoryName(WEB_ECR_SERVICE_NAME, envName as 'dev' | 'prod')
    );
    const workerEcrRepository = ecr.Repository.fromRepositoryName(
      this,
      'WorkerEcrRepository',
      getEcrRepositoryName(BATCH_ECR_SERVICE_NAME, envName as 'dev' | 'prod')
    );

    // Lambda と Batch のイメージのタグは、どちらもデプロイで push した 1 つのタグを指す。
    const imageTag = getImageTag();

    // IAM Role for Batch Job Execution
    const batchJobExecutionRole = new iam.Role(this, 'BatchJobExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for Batch job tasks',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant Batch job access to ECR
    workerEcrRepository.grantPull(batchJobExecutionRole);

    // IAM Role for Batch Job (container runtime)
    const batchJobRole = new BatchJobRole(this, 'BatchJobRole', {
      storageBucket,
      jobsTable,
    });
    grantErrorEventsWrite(this, batchJobRole, envName as 'dev' | 'prod');

    const { vpc, publicSubnetIds } = importSharedVpc(this, 'SharedVpc', envName as 'dev' | 'prod');

    // Create security group for Batch compute environment
    const batchSecurityGroup = new ec2.SecurityGroup(this, 'BatchSecurityGroup', {
      vpc: vpc,
      description: 'Security group for Batch Fargate tasks',
      allowAllOutbound: true,
    });

    // Batch Compute Environment (Fargate) - L1 construct for assignPublicIp support
    const computeEnvironment = new batch.CfnComputeEnvironment(this, 'ComputeEnvironment', {
      computeEnvironmentName: `nagiyu-codec-converter-${envName}`,
      type: 'MANAGED',
      state: 'ENABLED',
      computeResources: {
        type: 'FARGATE',
        maxvCpus: 16, // Supports multiple job sizes: small (1 vCPU) to xlarge (4 vCPU)
        subnets: publicSubnetIds,
        securityGroupIds: [batchSecurityGroup.securityGroupId],
      },
    });

    // Batch Job Queue - L1 construct
    const jobQueue = new batch.CfnJobQueue(this, 'JobQueue', {
      jobQueueName: `nagiyu-codec-converter-${envName}`,
      priority: 1,
      state: 'ENABLED',
      computeEnvironmentOrder: [
        {
          computeEnvironment: computeEnvironment.attrComputeEnvironmentArn,
          order: 1,
        },
      ],
    });

    // CloudWatch Log Group for Batch (created explicitly to avoid conflicts)
    const batchLogGroup = new logs.LogGroup(this, 'BatchLogGroup', {
      logGroupName: `/aws/batch/nagiyu-codec-converter-${envName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Batch Job Definitions - Multiple definitions for dynamic resource allocation
    // Define resource configurations for each job size
    const jobDefinitions = [
      { size: 'small', vcpu: '1', memory: '2048' },
      { size: 'medium', vcpu: '2', memory: '4096' },
      { size: 'large', vcpu: '4', memory: '8192' },
      { size: 'xlarge', vcpu: '4', memory: '16384' },
    ];

    // Create job definitions using a loop (DRY principle)
    const createdJobDefinitions = jobDefinitions.map((config) => {
      return new batch.CfnJobDefinition(this, `JobDefinition-${config.size}`, {
        jobDefinitionName: `nagiyu-codec-converter-${envName}-${config.size}`,
        type: 'container',
        platformCapabilities: ['FARGATE'],
        containerProperties: {
          image: `${workerEcrRepository.repositoryUri}:${imageTag}`,
          resourceRequirements: [
            {
              type: 'VCPU',
              value: config.vcpu,
            },
            {
              type: 'MEMORY',
              value: config.memory,
            },
          ],
          executionRoleArn: batchJobExecutionRole.roleArn,
          jobRoleArn: batchJobRole.roleArn,
          networkConfiguration: {
            assignPublicIp: 'ENABLED',
          },
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': batchLogGroup.logGroupName,
              'awslogs-region': this.region,
              'awslogs-stream-prefix': 'batch',
            },
          },
          environment: [
            {
              name: 'DYNAMODB_TABLE_NAME',
              value: jobsTable.tableName,
            },
            {
              name: 'S3_BUCKET',
              value: storageBucket.bucketName,
            },
            {
              name: 'AWS_REGION',
              value: this.region,
            },
            {
              name: 'ERROR_EVENTS_TABLE_NAME',
              value: `nagiyu-error-events-${envName}`,
            },
          ],
        },
        retryStrategy: {
          attempts: 2, // 1 retry = 2 attempts total
        },
        timeout: {
          attemptDurationSeconds: 7200, // 2 hours
        },
      });
    });

    // Keep reference to medium job definition for backward compatibility (default)
    const jobDefinition = createdJobDefinitions[1]; // medium is at index 1

    // Application Runtime Policy (Lambda 実行ロールが使用)
    const appRuntimePolicy = new AppRuntimePolicy(this, 'AppRuntimePolicy', {
      storageBucket,
      jobsTable,
      jobQueueArn: jobQueue.attrJobQueueArn,
      jobDefinitionPrefix: `nagiyu-codec-converter-${envName}`,
      envName,
    });

    // Lambda Execution Role
    const lambdaExecutionRole = new LambdaExecutionRole(this, 'LambdaExecutionRole', {
      appRuntimePolicy,
    });
    grantErrorEventsWrite(this, lambdaExecutionRole, envName as 'dev' | 'prod');

    // CloudWatch Log Group for Lambda (created explicitly to avoid conflicts)
    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
      logGroupName: `/aws/lambda/nagiyu-codec-converter-${envName}`,
      retention: DEFAULT_LAMBDA_LOG_RETENTION,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda Function for Next.js application
    const nextjsFunction = new lambda.DockerImageFunction(this, 'NextjsFunction', {
      functionName: `nagiyu-codec-converter-${envName}`,
      code: lambda.DockerImageCode.fromEcr(ecrRepository, {
        tagOrDigest: imageTag,
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      role: lambdaExecutionRole,
      logGroup: lambdaLogGroup,
      tracing: DEFAULT_LAMBDA_TRACING,
      environment: {
        APP_VERSION: appVersion,
        DYNAMODB_TABLE_NAME: jobsTable.tableName,
        S3_BUCKET: storageBucket.bucketName,
        BATCH_JOB_QUEUE: jobQueue.jobQueueName || `nagiyu-codec-converter-${envName}`,
        BATCH_JOB_DEFINITION_PREFIX: `nagiyu-codec-converter-${envName}`, // Prefix for all job definitions (e.g., nagiyu-codec-converter-dev-small)
        ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${envName}`,
        // AWS_REGION is automatically provided by Lambda runtime
      },
      // Note: Lambda Web Adapter must be included in the Docker image itself
      // Layers are not supported for container image functions
    });

    // Function URL for Lambda
    const functionUrl = nextjsFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      ssm.StringParameter.valueForStringParameter(this, SSM_PARAMETERS.ACM_CERTIFICATE_ARN)
    );

    // ドメイン名（dev/prod 共通で baseDomain から組み立てる。envName によるプレフィックス分岐はしない）
    const domainName = `codec-converter.${baseDomain}`;

    // セキュリティヘッダーを付け、検索エンジンにインデックスさせない (Portal 以外は常に noindex)
    const securityHeadersPolicy = createResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `nagiyu-codec-converter-security-headers-${envName}`,
      comment: `Security headers for codec-converter service (${envName})`,
      securityHeaders: true,
      noindex: true,
    });

    // Function URL のオリジン。OAC で署名して呼ぶ。1 つを全 behavior で共有する。
    const { origin: functionUrlOrigin } = createFunctionUrlOrigin(this, 'FunctionUrl', {
      originAccessControlName: `nagiyu-codec-converter-lambda-oac-${envName}`,
      functionUrl: functionUrl.url,
    });

    // OAC の署名は本文の SHA256 を要るため、本文を受ける behavior では origin-request で付ける。
    // GET / HEAD だけを受ける静的アセットの behavior には本文が無いので付けない。
    const edgeLambdas = createBodyHashEdgeLambdas(this, 'BodyHashEdgeFunction');

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Codec Converter distribution for ${envName}`,
      domainNames: [domainName],
      certificate: certificate,
      defaultBehavior: {
        origin: functionUrlOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
        edgeLambdas,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: functionUrlOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true,
          edgeLambdas,
        },
        '/_next/static/*': {
          origin: functionUrlOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'NextStaticCachePolicy', {
            cachePolicyName: `nagiyu-codec-converter-next-static-${envName}`,
            defaultTtl: cdk.Duration.days(365),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.days(365),
          }),
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true,
        },
        '/favicon.ico': {
          origin: functionUrlOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'FaviconCachePolicy', {
            cachePolicyName: `nagiyu-codec-converter-favicon-${envName}`,
            defaultTtl: cdk.Duration.days(1),
            maxTtl: cdk.Duration.days(1),
            minTtl: cdk.Duration.days(1),
          }),
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true,
        },
      },
    });

    // CloudFront (OAC) の署名付きアクセスを、この配信に限って許可する。
    // 同じスタックなので配信の ARN で絞れる。
    grantCloudFrontInvoke(nextjsFunction, {
      sourceArn: this.formatArn({
        service: 'cloudfront',
        region: '',
        resource: 'distribution',
        resourceName: distribution.distributionId,
      }),
    });

    // dev 環境のみ、dev アカウントの Route53 ゾーンへ CloudFront 向け ALIAS A レコードを作成する。
    // prod は既存の CNAME 直書き（infra/shared/lib/route53-records-stack.ts）で管理されているため、
    // ここではレコードを作成しない。
    if (envName === 'dev') {
      createCloudFrontAliasRecord(this, 'AliasRecord', {
        distribution,
        recordName: 'codec-converter',
        comment: `Codec Converter (${envName}) - alias to CloudFront`,
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'StorageBucketName', {
      value: storageBucket.bucketName,
      description: 'S3 bucket name for codec converter storage',
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: jobsTable.tableName,
      description: 'DynamoDB table name for codec converter jobs',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: nextjsFunction.functionArn,
      description: 'Lambda function ARN for Next.js application',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionUrl', {
      value: functionUrl.url,
      description: 'Lambda Function URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'BatchJobQueueArn', {
      value: jobQueue.attrJobQueueArn,
      description: 'Batch job queue ARN',
    });

    new cdk.CfnOutput(this, 'BatchJobDefinitionArn', {
      value: jobDefinition.attrJobDefinitionArn,
      description: 'Batch job definition ARN',
    });
  }
}
