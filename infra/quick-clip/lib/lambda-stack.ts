import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { QuickClipEnvironment } from './environment';

const QUICK_CLIP_ALLOWED_ORIGINS: Record<QuickClipEnvironment, string[]> = {
  prod: ['https://quick-clip.nagiyu.com'],
  dev: ['https://dev-quick-clip.nagiyu.com'],
};

export interface LambdaStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  appVersion: string;
  webEcrRepositoryName: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly webFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { environment, appVersion, webEcrRepositoryName } = props;

    const webRepository = ecr.Repository.fromRepositoryName(
      this,
      'WebRepository',
      webEcrRepositoryName
    );

    const webExecutionRole = new iam.Role(this, 'WebExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    this.webFunction = new lambda.Function(this, 'WebFunction', {
      functionName: `nagiyu-quick-clip-web-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(webRepository, {
        tagOrDigest: appVersion,
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: webExecutionRole,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        // NODE_ENV は Node.js/Next.js の最適化・挙動切替用（production/development 固定値）、
        // DEPLOY_ENV はアプリ内で dev/prod 判定を行うためのデプロイ環境識別子として利用する。
        NODE_ENV: environment === 'prod' ? 'production' : 'development',
        DEPLOY_ENV: environment,
        APP_VERSION: appVersion,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    this.functionUrl = this.webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: QUICK_CLIP_ALLOWED_ORIGINS[environment],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    });

    cdk.Tags.of(this.webFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.webFunction).add('Service', 'quick-clip');
    cdk.Tags.of(this.webFunction).add('Environment', environment);

    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Web Lambda Function URL',
    });
  }
}
