import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

const QUICK_CLIP_ALLOWED_ORIGINS: Record<QuickClipEnvironment, string[]> = {
  prod: ['https://quick-clip.nagiyu.com'],
  dev: ['https://dev-quick-clip.nagiyu.com'],
};
const BATCH_JOB_DEFINITION_VARIANTS = ['small', 'large', 'xlarge'] as const;

export interface LambdaStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  appVersion: string;
  webEcrRepositoryName: string;
  clipLambdaEcrRepositoryName: string;
  zipLambdaEcrRepositoryName: string;
  jobsTableName: string;
  jobsTableArn: string;
  storageBucketName: string;
  storageBucketArn: string;
  batchJobQueueArn: string;
  batchJobDefinitionPrefix: string;
  batchJobDefinitionArns: string[];
}

export class LambdaStack extends LambdaStackBase {
  public readonly webFunction: lambda.Function;
  public readonly clipFunction: lambda.Function;
  public readonly zipFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const {
      environment,
      appVersion,
      webEcrRepositoryName,
      clipLambdaEcrRepositoryName,
      zipLambdaEcrRepositoryName,
      jobsTableName,
      jobsTableArn,
      storageBucketName,
      storageBucketArn,
      batchJobQueueArn,
      batchJobDefinitionPrefix,
      batchJobDefinitionArns,
      ...stackProps
    } = props;
    const region = stackProps.env?.region ?? cdk.Aws.REGION;
    const account = stackProps.env?.account ?? cdk.Aws.ACCOUNT_ID;
    const jobDefinitionArnsWithAndWithoutVersions = BATCH_JOB_DEFINITION_VARIANTS.flatMap(
      (variant) => [
        `arn:aws:batch:${region}:${account}:job-definition/${batchJobDefinitionPrefix}-${variant}`,
        `arn:aws:batch:${region}:${account}:job-definition/${batchJobDefinitionPrefix}-${variant}:*`,
      ]
    );
    // batchJobDefinitionArns に CloudFormation が返す具体バージョン ARN（...:1 など）が入り、
    // 同時に明示的なパターン ARN も追加するため重複し得る。Set で重複を除外して最小化する。
    const batchSubmitJobResources = Array.from(
      new Set([
        batchJobQueueArn,
        ...batchJobDefinitionArns,
        ...jobDefinitionArnsWithAndWithoutVersions,
      ])
    );

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
      ecrRepositoryName: webEcrRepositoryName,
      lambdaConfig: {
        functionName: `nagiyu-quick-clip-web-${environment}`,
        logicalId: 'WebFunction',
        memorySize: 1024,
        timeout: 30,
        environment: {
          // NODE_ENV は Node.js/Next.js の最適化・挙動切替用（production/development 固定値）、
          // DEPLOY_ENV はアプリ内で dev/prod 判定を行うためのデプロイ環境識別子として利用する。
          NODE_ENV: environment === 'prod' ? 'production' : 'development',
          DEPLOY_ENV: environment,
          APP_VERSION: appVersion,
          DYNAMODB_TABLE_NAME: jobsTableName,
          S3_BUCKET: storageBucketName,
          BATCH_JOB_QUEUE_ARN: batchJobQueueArn,
          BATCH_JOB_DEFINITION_PREFIX: batchJobDefinitionPrefix,
          CLIP_REGENERATE_FUNCTION_NAME: `nagiyu-quick-clip-clip-regenerate-${environment}`,
          ZIP_GENERATOR_FUNCTION_NAME: `nagiyu-quick-clip-zip-generator-${environment}`,
        },
      },
      additionalPolicyStatements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
          ],
          resources: [jobsTableArn, `${jobsTableArn}/index/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [storageBucketArn],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:PutObject'],
          resources: [`${storageBucketArn}/*`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['batch:SubmitJob'],
          resources: batchSubmitJobResources,
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['batch:DescribeJobs'],
          // DescribeJobs はリソースレベル権限制御をサポートしないため '*' が必要
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [
            `arn:aws:lambda:${region}:${account}:function:nagiyu-quick-clip-clip-regenerate-${environment}`,
            `arn:aws:lambda:${region}:${account}:function:nagiyu-quick-clip-zip-generator-${environment}`,
          ],
        }),
      ],
      enableFunctionUrl: true,
      functionUrlCorsConfig: {
        allowedOrigins: QUICK_CLIP_ALLOWED_ORIGINS[environment],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    };

    super(scope, id, baseProps);

    this.webFunction = this.lambdaFunction;

    const clipLambdaRepository = ecr.Repository.fromRepositoryName(
      this,
      'ClipLambdaEcrRepository',
      clipLambdaEcrRepositoryName
    );
    const zipLambdaRepository = ecr.Repository.fromRepositoryName(
      this,
      'ZipLambdaEcrRepository',
      zipLambdaEcrRepositoryName
    );

    this.clipFunction = new lambda.Function(this, 'ClipRegenerateFunction', {
      functionName: `nagiyu-quick-clip-clip-regenerate-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(clipLambdaRepository, {
        tagOrDigest: 'latest',
      }),
      memorySize: 2048,
      timeout: cdk.Duration.seconds(300),
      ephemeralStorageSize: cdk.Size.mebibytes(10240),
      environment: {
        NODE_ENV: environment === 'prod' ? 'production' : 'development',
        DEPLOY_ENV: environment,
        DYNAMODB_TABLE_NAME: jobsTableName,
        S3_BUCKET: storageBucketName,
      },
    });
    this.clipFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
        resources: [jobsTableArn, `${jobsTableArn}/index/*`],
      })
    );
    this.clipFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [storageBucketArn],
      })
    );
    this.clipFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [`${storageBucketArn}/*`],
      })
    );

    this.zipFunction = new lambda.Function(this, 'ZipGeneratorFunction', {
      functionName: `nagiyu-quick-clip-zip-generator-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(zipLambdaRepository, {
        tagOrDigest: 'latest',
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(120),
      environment: {
        NODE_ENV: environment === 'prod' ? 'production' : 'development',
        DEPLOY_ENV: environment,
        S3_BUCKET: storageBucketName,
      },
    });
    this.zipFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [storageBucketArn],
      })
    );
    this.zipFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [`${storageBucketArn}/*`],
      })
    );

    new cdk.CfnOutput(this, 'ClipRegenerateFunctionArn', {
      value: this.clipFunction.functionArn,
      description: 'Clip Regenerate Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ZipGeneratorFunctionArn', {
      value: this.zipFunction.functionArn,
      description: 'Zip Generator Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
    });
  }
}
