import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Lambda 実行ロールの作成
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `tools-lambda-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for Tools Lambda function (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // ECR リポジトリの参照
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      `tools-app-${environment}`
    );

    // Lambda 関数の作成
    this.lambdaFunction = new lambda.Function(this, 'ToolsFunction', {
      functionName: `tools-app-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(repository, {
        tagOrDigest: 'latest',
      }),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.X86_64,
      role: lambdaRole,
      environment: {
        NODE_ENV: environment === 'prod' ? 'production' : 'development',
        ENVIRONMENT: environment,
      },
      description: `Tools Service Lambda function for ${environment} environment`,
    });

    // Lambda 関数 URL の作成
    this.functionUrl = this.lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });

    // Lambda Function URL への公開アクセスを許可
    // Function URL with NONE auth type は自動的に公開アクセスを許可するため、
    // 追加の Permission は不要（CDK が自動的に設定）

    // タグの追加
    cdk.Tags.of(this.lambdaFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.lambdaFunction).add('Service', 'tools');
    cdk.Tags.of(this.lambdaFunction).add('Environment', environment);

    // Outputs
    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda Function Name',
      exportName: `${this.stackName}-FunctionName`,
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${this.stackName}-FunctionArn`,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Lambda Function URL',
      exportName: `${this.stackName}-FunctionUrl`,
    });

    new cdk.CfnOutput(this, 'RoleArn', {
      value: lambdaRole.roleArn,
      description: 'Lambda Execution Role ARN',
      exportName: `${this.stackName}-RoleArn`,
    });
  }
}
