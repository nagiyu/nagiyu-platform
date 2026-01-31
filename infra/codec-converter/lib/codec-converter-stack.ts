import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AppRuntimePolicy } from './policies/app-runtime-policy';
import { LambdaExecutionRole } from './roles/lambda-execution-role';
import { BatchJobRole } from './roles/batch-job-role';
import { DevUser } from './users/dev-user';

export interface CodecConverterStackProps extends cdk.StackProps {
  appVersion?: string;
}

export class CodecConverterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: CodecConverterStackProps) {
    super(scope, id, props);

    // Environment name (default to 'dev')
    const envName = this.node.tryGetContext('env') || 'dev';
    const appVersion = props?.appVersion || '1.0.0';

    // CORS allowed origin (configurable per environment)
    const defaultOrigin =
      envName === 'prod'
        ? 'https://codec-converter.nagiyu.com'
        : 'https://dev-codec-converter.nagiyu.com';
    const allowedOrigin = this.node.tryGetContext('allowedOrigin') || defaultOrigin;

    // S3 Bucket for input/output files
    const storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: `nagiyu-codec-converter-storage-${envName}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Deployment phase control
    const deploymentPhase = this.node.tryGetContext('deploymentPhase') || 'full';

    // ECR repository for Lambda container image
    const ecrRepositoryName =
      this.node.tryGetContext('ecrRepositoryName') || `codec-converter-${envName}`;
    const imageTag = this.node.tryGetContext('imageTag') || 'latest';

    // Create or reference Web ECR repository based on deployment phase
    const ecrRepository =
      deploymentPhase === 'ecr-only'
        ? new ecr.Repository(this, 'EcrRepository', {
            repositoryName: ecrRepositoryName,
            imageScanOnPush: true,
            lifecycleRules: [
              {
                description: 'Keep last 10 images',
                maxImageCount: 10,
                rulePriority: 1,
              },
            ],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
          })
        : ecr.Repository.fromRepositoryName(this, 'EcrRepository', ecrRepositoryName);

    // Create or reference Batch worker ECR repository based on deployment phase
    const workerEcrRepository =
      deploymentPhase === 'ecr-only'
        ? new ecr.Repository(this, 'WorkerEcrRepository', {
            repositoryName: `codec-converter-ffmpeg-${envName}`,
            imageScanOnPush: true,
            lifecycleRules: [
              {
                description: 'Keep last 10 images',
                maxImageCount: 10,
                rulePriority: 1,
              },
            ],
            removalPolicy: cdk.RemovalPolicy.RETAIN,
          })
        : ecr.Repository.fromRepositoryName(
            this,
            'WorkerEcrRepository',
            `codec-converter-ffmpeg-${envName}`
          );

    // Only create Lambda, Batch, and other resources in 'full' deployment phase
    if (deploymentPhase === 'full') {
      // IAM Role for Batch Job Execution
      const batchJobExecutionRole = new iam.Role(this, 'BatchJobExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        description: 'Execution role for Batch job tasks',
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonECSTaskExecutionRolePolicy'
          ),
        ],
      });

      // Grant Batch job access to ECR
      workerEcrRepository.grantPull(batchJobExecutionRole);

      // IAM Role for Batch Job (container runtime)
      const batchJobRole = new BatchJobRole(this, 'BatchJobRole', {
        storageBucket,
        jobsTable,
      });

      // Import shared VPC from platform infrastructure
      // Uses Vpc.fromLookup which queries AWS API via CDK context cache
      // For testing: if vpcId is provided in context, lookup by explicit vpcId
      // For deployment: lookup by Name tag to find nagiyu-{env}-vpc
      const vpcId = this.node.tryGetContext('vpcId');
      const vpc = vpcId
        ? ec2.Vpc.fromLookup(this, 'SharedVpc', { vpcId })
        : ec2.Vpc.fromLookup(this, 'SharedVpc', {
            tags: {
              Name: `nagiyu-${envName}-vpc`,
            },
          });

      // Get public subnets from VPC
      const publicSubnets = vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      });

      // Create security group for Batch compute environment
      const batchSecurityGroup = new ec2.SecurityGroup(this, 'BatchSecurityGroup', {
        vpc: vpc,
        description: 'Security group for Batch Fargate tasks',
        allowAllOutbound: true,
      });

      // Batch Compute Environment (Fargate) - L1 construct for assignPublicIp support
      const computeEnvironment = new batch.CfnComputeEnvironment(this, 'ComputeEnvironment', {
        computeEnvironmentName: `codec-converter-${envName}`,
        type: 'MANAGED',
        state: 'ENABLED',
        computeResources: {
          type: 'FARGATE',
          maxvCpus: 6, // 3 jobs × 2 vCPU each
          subnets: publicSubnets.subnetIds,
          securityGroupIds: [batchSecurityGroup.securityGroupId],
        },
      });

      // Batch Job Queue - L1 construct
      const jobQueue = new batch.CfnJobQueue(this, 'JobQueue', {
        jobQueueName: `codec-converter-${envName}`,
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
        logGroupName: `/aws/batch/codec-converter-${envName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Batch Job Definition - L1 construct for AssignPublicIp support
      const workerImageTag = this.node.tryGetContext('workerImageTag') || 'latest';
      const jobDefinition = new batch.CfnJobDefinition(this, 'JobDefinition', {
        jobDefinitionName: `codec-converter-${envName}`,
        type: 'container',
        platformCapabilities: ['FARGATE'],
        containerProperties: {
          image: `${workerEcrRepository.repositoryUri}:${workerImageTag}`,
          resourceRequirements: [
            {
              type: 'VCPU',
              value: '2',
            },
            {
              type: 'MEMORY',
              value: '4096',
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
              name: 'DYNAMODB_TABLE',
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
          ],
        },
        retryStrategy: {
          attempts: 2, // 1 retry = 2 attempts total
        },
        timeout: {
          attemptDurationSeconds: 7200, // 2 hours
        },
      });

      // Application Runtime Policy (shared by Lambda and developers)
      const appRuntimePolicy = new AppRuntimePolicy(this, 'AppRuntimePolicy', {
        storageBucket,
        jobsTable,
        jobQueueArn: jobQueue.attrJobQueueArn,
        jobDefinitionName: jobDefinition.jobDefinitionName!,
        envName,
      });

      // Lambda Execution Role
      const lambdaExecutionRole = new LambdaExecutionRole(this, 'LambdaExecutionRole', {
        appRuntimePolicy,
      });

      // Development IAM User (shares the same runtime policy as Lambda)
      new DevUser(this, 'DevUser', {
        appRuntimePolicy,
        envName,
      });

      // CloudWatch Log Group for Lambda (created explicitly to avoid conflicts)
      const lambdaLogGroup = new logs.LogGroup(this, 'LambdaLogGroup', {
        logGroupName: `/aws/lambda/codec-converter-${envName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      // Lambda Function for Next.js application
      const nextjsFunction = new lambda.DockerImageFunction(this, 'NextjsFunction', {
        functionName: `codec-converter-${envName}`,
        code: lambda.DockerImageCode.fromEcr(ecrRepository, {
          tagOrDigest: imageTag,
        }),
        memorySize: 1024,
        timeout: cdk.Duration.seconds(30),
        role: lambdaExecutionRole,
        logGroup: lambdaLogGroup,
        environment: {
          APP_VERSION: appVersion,
          DYNAMODB_TABLE: jobsTable.tableName,
          S3_BUCKET: storageBucket.bucketName,
          BATCH_JOB_QUEUE: jobQueue.jobQueueName || `codec-converter-${envName}`,
          BATCH_JOB_DEFINITION: jobDefinition.jobDefinitionName || `codec-converter-${envName}`,
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

      // Import ACM certificate from CloudFormation export
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        cdk.Fn.importValue('nagiyu-shared-acm-certificate-arn')
      );

      // Construct domain name based on environment
      const baseDomain = cdk.Fn.importValue('nagiyu-shared-acm-domain-name');
      const domainName =
        envName === 'prod'
          ? `codec-converter.${baseDomain}`
          : `${envName}-codec-converter.${baseDomain}`;

      // CloudFront Distribution
      const distribution = new cloudfront.Distribution(this, 'Distribution', {
        comment: `Codec Converter distribution for ${envName}`,
        domainNames: [domainName],
        certificate: certificate,
        defaultBehavior: {
          origin: new origins.FunctionUrlOrigin(functionUrl),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
        additionalBehaviors: {
          '/api/*': {
            origin: new origins.FunctionUrlOrigin(functionUrl),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            compress: true,
          },
          '/_next/static/*': {
            origin: new origins.FunctionUrlOrigin(functionUrl),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: new cloudfront.CachePolicy(this, 'NextStaticCachePolicy', {
              cachePolicyName: `codec-converter-next-static-${envName}`,
              defaultTtl: cdk.Duration.days(365),
              maxTtl: cdk.Duration.days(365),
              minTtl: cdk.Duration.days(365),
            }),
            compress: true,
          },
          '/favicon.ico': {
            origin: new origins.FunctionUrlOrigin(functionUrl),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: new cloudfront.CachePolicy(this, 'FaviconCachePolicy', {
              cachePolicyName: `codec-converter-favicon-${envName}`,
              defaultTtl: cdk.Duration.days(1),
              maxTtl: cdk.Duration.days(1),
              minTtl: cdk.Duration.days(1),
            }),
            compress: true,
          },
        },
      });

      // Outputs
      new cdk.CfnOutput(this, 'StorageBucketName', {
        value: storageBucket.bucketName,
        description: 'S3 bucket name for codec converter storage',
        exportName: `CodecConverterStorageBucket-${envName}`,
      });

      new cdk.CfnOutput(this, 'JobsTableName', {
        value: jobsTable.tableName,
        description: 'DynamoDB table name for codec converter jobs',
        exportName: `CodecConverterJobsTable-${envName}`,
      });

      new cdk.CfnOutput(this, 'LambdaFunctionArn', {
        value: nextjsFunction.functionArn,
        description: 'Lambda function ARN for Next.js application',
        exportName: `CodecConverterLambdaFunctionArn-${envName}`,
      });

      new cdk.CfnOutput(this, 'LambdaFunctionUrl', {
        value: functionUrl.url,
        description: 'Lambda Function URL',
        exportName: `CodecConverterLambdaFunctionUrl-${envName}`,
      });

      new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
        value: distribution.distributionId,
        description: 'CloudFront distribution ID',
        exportName: `CodecConverterCloudFrontDistributionId-${envName}`,
      });

      new cdk.CfnOutput(this, 'CloudFrontDomainName', {
        value: distribution.distributionDomainName,
        description: 'CloudFront distribution domain name',
        exportName: `CodecConverterCloudFrontDomainName-${envName}`,
      });

      new cdk.CfnOutput(this, 'WorkerEcrRepositoryUri', {
        value: workerEcrRepository.repositoryUri,
        description: 'ECR repository URI for Batch worker',
        exportName: `CodecConverterWorkerEcrRepositoryUri-${envName}`,
      });

      new cdk.CfnOutput(this, 'BatchJobQueueArn', {
        value: jobQueue.attrJobQueueArn,
        description: 'Batch job queue ARN',
        exportName: `CodecConverterBatchJobQueueArn-${envName}`,
      });

      new cdk.CfnOutput(this, 'BatchJobDefinitionArn', {
        value: jobDefinition.attrJobDefinitionArn,
        description: 'Batch job definition ARN',
        exportName: `CodecConverterBatchJobDefinitionArn-${envName}`,
      });
    }
  }
}
