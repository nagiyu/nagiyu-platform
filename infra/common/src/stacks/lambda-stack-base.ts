import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { LambdaConfig } from '../types/lambda-config';
import { Environment } from '../types/environment';
import { getLambdaFunctionName } from '../utils/naming';
import { DEFAULT_LAMBDA_CONFIG, mergeConfig } from '../constants/defaults';

/**
 * LambdaStackBase のプロパティ
 */
export interface LambdaStackBaseProps extends cdk.StackProps {
  /**
   * サービス名（例: tools, auth, admin）
   */
  serviceName: string;

  /**
   * 環境（dev または prod）
   */
  environment: Environment;

  /**
   * ECR リポジトリ名
   * 指定しない場合は serviceName-environment から自動推測
   */
  ecrRepositoryName?: string;

  /**
   * Lambda 設定（オプショナル）
   */
  lambdaConfig?: LambdaConfig;

  /**
   * 追加の IAM ポリシーステートメント
   */
  additionalPolicyStatements?: iam.PolicyStatement[];

  /**
   * Function URL を作成するか
   * @default true
   */
  enableFunctionUrl?: boolean;

  /**
   * Function URL の CORS 設定
   */
  functionUrlCorsConfig?: lambda.FunctionUrlCorsOptions;
}

/**
 * Lambda 関数の基本スタック
 *
 * すべてのサービスで共通利用できる Lambda スタックの基本実装を提供します。
 *
 * ## 主な機能
 * - Lambda 関数の作成
 * - ECR イメージからのデプロイ
 * - 実行ロールの作成
 * - 環境変数の設定
 * - Function URL の作成（オプション）
 * - CloudFormation Outputs
 *
 * ## カスタマイズポイント
 * - 関数名（デフォルト: 命名規則に従って自動生成）
 * - メモリサイズ（デフォルト: 512MB）
 * - タイムアウト（デフォルト: 30秒）
 * - アーキテクチャ（デフォルト: X86_64）
 * - 環境変数
 * - 追加の IAM ポリシー
 * - Function URL の有効化（デフォルト: true）
 *
 * @example
 * ```typescript
 * // 基本的な使用例
 * const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
 *   serviceName: 'tools',
 *   environment: 'dev',
 *   ecrRepositoryName: 'nagiyu-tools-ecr-dev',
 * });
 *
 * // カスタマイズ例
 * const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
 *   serviceName: 'auth',
 *   environment: 'prod',
 *   ecrRepositoryName: 'nagiyu-auth-ecr-prod',
 *   lambdaConfig: {
 *     memorySize: 1024,
 *     timeout: 60,
 *     environment: {
 *       NODE_ENV: 'production',
 *       DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
 *     },
 *   },
 *   additionalPolicyStatements: [
 *     new iam.PolicyStatement({
 *       effect: iam.Effect.ALLOW,
 *       actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
 *       resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
 *     }),
 *   ],
 * });
 * ```
 */
export class LambdaStackBase extends cdk.Stack {
  /**
   * 作成された Lambda 関数
   */
  public readonly lambdaFunction: lambda.Function;

  /**
   * Lambda 実行ロール
   */
  public readonly executionRole: iam.Role;

  /**
   * Function URL（enableFunctionUrl が true の場合）
   */
  public readonly functionUrl?: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackBaseProps) {
    super(scope, id, props);

    const {
      serviceName,
      environment,
      ecrRepositoryName,
      lambdaConfig,
      additionalPolicyStatements,
      enableFunctionUrl = true,
      functionUrlCorsConfig,
    } = props;

    // デフォルト設定とマージ
    const config = mergeConfig(lambdaConfig, DEFAULT_LAMBDA_CONFIG);

    // 関数名（カスタム名が指定されていない場合は命名規則に従う）
    const functionName =
      lambdaConfig?.functionName || getLambdaFunctionName(serviceName, environment);

    // ECR リポジトリの参照（リポジトリ名が指定されていない場合はデフォルト）
    const repoName = ecrRepositoryName || `nagiyu-${serviceName}-ecr-${environment}`;
    const repository = ecr.Repository.fromRepositoryName(this, 'EcrRepository', repoName);

    // Lambda 実行ロールの作成
    this.executionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${serviceName} Lambda function (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // 追加のポリシーステートメントがあれば適用
    if (additionalPolicyStatements) {
      additionalPolicyStatements.forEach((statement) => {
        this.executionRole.addToPolicy(statement);
      });
    }

    // アーキテクチャの設定
    const architecture =
      config.architecture === 'ARM_64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;

    // Lambda 関数の作成
    this.lambdaFunction = new lambda.Function(this, 'Function', {
      functionName,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(repository, {
        tagOrDigest: 'latest',
      }),
      memorySize: config.memorySize,
      timeout: cdk.Duration.seconds(config.timeout),
      architecture,
      role: this.executionRole,
      environment: lambdaConfig?.environment,
      reservedConcurrentExecutions: lambdaConfig?.reservedConcurrentExecutions,
      description: `${serviceName} Service Lambda function for ${environment} environment`,
    });

    // Function URL の作成
    if (enableFunctionUrl) {
      const defaultCorsConfig: lambda.FunctionUrlCorsOptions = {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      };

      this.functionUrl = this.lambdaFunction.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        cors: functionUrlCorsConfig || defaultCorsConfig,
      });

      // Lambda Function URL への公開アクセスを許可
      this.lambdaFunction.addPermission('AllowPublicAccess', {
        principal: new iam.AnyPrincipal(),
        action: 'lambda:InvokeFunctionUrl',
        functionUrlAuthType: lambda.FunctionUrlAuthType.NONE,
      });
    }

    // タグの追加
    cdk.Tags.of(this.lambdaFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.lambdaFunction).add('Service', serviceName);
    cdk.Tags.of(this.lambdaFunction).add('Environment', environment);

    // CloudFormation Outputs
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

    if (this.functionUrl) {
      new cdk.CfnOutput(this, 'FunctionUrl', {
        value: this.functionUrl.url,
        description: 'Lambda Function URL',
        exportName: `${this.stackName}-FunctionUrl`,
      });
    }

    new cdk.CfnOutput(this, 'RoleArn', {
      value: this.executionRole.roleArn,
      description: 'Lambda Execution Role ARN',
      exportName: `${this.stackName}-RoleArn`,
    });
  }
}
