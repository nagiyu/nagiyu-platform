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
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export class CodecConverterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Environment name (default to 'dev')
    const envName = this.node.tryGetContext('env') || 'dev';

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

    // Create or reference ECR repository based on deployment phase
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

    // Only create Lambda, Batch, and other resources in 'full' deployment phase
    if (deploymentPhase === 'full') {
      // ECR Repository for Batch worker image
      const workerEcrRepository = new ecr.Repository(this, 'WorkerEcrRepository', {
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
      });

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
      const batchJobRole = new iam.Role(this, 'BatchJobRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        description: 'Role for Batch job container runtime',
      });

      // Grant Batch job permissions to S3 and DynamoDB
      storageBucket.grantReadWrite(batchJobRole);
      jobsTable.grantReadWriteData(batchJobRole);

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

      // Batch Compute Environment (Fargate)
      const computeEnvironment = new batch.FargateComputeEnvironment(this, 'ComputeEnvironment', {
        computeEnvironmentName: `codec-converter-${envName}`,
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
        maxvCpus: 6, // 3 jobs × 2 vCPU each
      });

      // Batch Job Queue
      const jobQueue = new batch.JobQueue(this, 'JobQueue', {
        jobQueueName: `codec-converter-${envName}`,
        priority: 1,
        computeEnvironments: [
          {
            computeEnvironment: computeEnvironment,
            order: 1,
          },
        ],
      });

      // Batch Job Definition
      const workerImageTag = this.node.tryGetContext('workerImageTag') || 'latest';
      const jobDefinition = new batch.EcsJobDefinition(this, 'JobDefinition', {
        jobDefinitionName: `codec-converter-${envName}`,
        container: new batch.EcsFargateContainerDefinition(this, 'JobContainer', {
          image: ecs.ContainerImage.fromEcrRepository(workerEcrRepository, workerImageTag),
          cpu: 2,
          memory: cdk.Size.mebibytes(4096),
          executionRole: batchJobExecutionRole,
          jobRole: batchJobRole,
          environment: {
            DYNAMODB_TABLE: jobsTable.tableName,
            S3_BUCKET: storageBucket.bucketName,
            AWS_REGION: this.region,
          },
        }),
        timeout: cdk.Duration.hours(2),
        retryAttempts: 1, // 1 retry as per architecture.md:404
        retryStrategies: [
          batch.RetryStrategy.of(batch.Action.RETRY, batch.Reason.NON_ZERO_EXIT_CODE),
        ],
      });

      // Lambda Execution Role
      const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description: 'Execution role for Codec Converter Lambda function',
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });

      // Grant Lambda permissions to S3 (for Presigned URLs)
      storageBucket.grantReadWrite(lambdaExecutionRole);

      // Grant Lambda permissions to DynamoDB
      jobsTable.grantReadWriteData(lambdaExecutionRole);

      // Grant Lambda permissions to submit Batch jobs
      lambdaExecutionRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['batch:SubmitJob'],
          resources: [jobQueue.jobQueueArn, jobDefinition.jobDefinitionArn],
        })
      );

      // Grant Lambda permissions to describe and manage Batch jobs
      // Job ARNs cannot be known in advance, so use wildcard
      lambdaExecutionRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['batch:DescribeJobs', 'batch:TerminateJob'],
          resources: ['*'],
        })
      );
      // Lambda Function for Next.js application
      const nextjsFunction = new lambda.DockerImageFunction(this, 'NextjsFunction', {
        functionName: `codec-converter-${envName}`,
        code: lambda.DockerImageCode.fromEcr(ecrRepository, {
          tagOrDigest: imageTag,
        }),
        memorySize: 1024,
        timeout: cdk.Duration.seconds(30),
        role: lambdaExecutionRole,
        environment: {
          DYNAMODB_TABLE: jobsTable.tableName,
          S3_BUCKET: storageBucket.bucketName,
          BATCH_JOB_QUEUE: jobQueue.jobQueueName,
          BATCH_JOB_DEFINITION: jobDefinition.jobDefinitionName,
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
        value: jobQueue.jobQueueArn,
        description: 'Batch job queue ARN',
        exportName: `CodecConverterBatchJobQueueArn-${envName}`,
      });

      new cdk.CfnOutput(this, 'BatchJobDefinitionArn', {
        value: jobDefinition.jobDefinitionArn,
        description: 'Batch job definition ARN',
        exportName: `CodecConverterBatchJobDefinitionArn-${envName}`,
      });
    }
  }
}
