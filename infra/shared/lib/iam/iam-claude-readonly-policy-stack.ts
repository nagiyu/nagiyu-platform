import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * IAM Claude Read-Only Policy Stack
 *
 * Claude Code on the web から AWS リソースを閲覧調査するための
 * 読み取り専用ポリシーを定義します。
 *
 * 設計方針:
 * - List / Get / Describe / Scan / Query / Filter / Search 系のみ許可
 * - 既存の 4 デプロイポリシーには影響を与えない独立リソース
 * - PII / 機密情報の閲覧経路は明示 Deny で遮断
 *     - Secrets Manager: GetSecretValue を Deny
 *     - KMS: Decrypt / Encrypt / GenerateDataKey 系を Deny
 *       （副作用として SSM SecureString も復号不可になる）
 *     - DynamoDB: nagiyu-auth-users-* テーブルへの読み取りを Deny
 *
 * 例外:
 * - DynamoDB の Scan / Query / GetItem が KMS 暗号化済みテーブルに対して
 *   成功するよう、kms:ViaService が DynamoDB の場合に限り kms:Decrypt を許可
 *   （SSM SecureString / Secrets Manager 経由の復号は引き続き Deny）
 */
export class IamClaudeReadonlyPolicyStack extends cdk.Stack {
  public readonly policy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.policy = new iam.ManagedPolicy(this, 'Policy', {
      managedPolicyName: 'nagiyu-claude-readonly-policy',
      description:
        'Claude Code on the web 用の閲覧専用権限。機密リソースは明示 Deny で遮断。',
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowReadOnlyOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            // CloudFormation
            'cloudformation:Describe*',
            'cloudformation:Get*',
            'cloudformation:List*',
            // CloudWatch / Logs
            'cloudwatch:Describe*',
            'cloudwatch:Get*',
            'cloudwatch:List*',
            'logs:Describe*',
            'logs:Get*',
            'logs:List*',
            'logs:FilterLogEvents',
            'logs:StartQuery',
            'logs:StopQuery',
            'logs:TestMetricFilter',
            // Lambda
            'lambda:Get*',
            'lambda:List*',
            // ECS / Batch
            'ecs:Describe*',
            'ecs:List*',
            'batch:Describe*',
            'batch:List*',
            // ECR
            'ecr:Describe*',
            'ecr:List*',
            'ecr:Get*',
            'ecr:BatchCheckLayerAvailability',
            'ecr:BatchGetImage',
            // CloudFront
            'cloudfront:Get*',
            'cloudfront:List*',
            // API Gateway (read-only は GET メソッド)
            'apigateway:GET',
            // DynamoDB (auth-users への読み取りは別途 Deny)
            'dynamodb:Describe*',
            'dynamodb:List*',
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Scan',
            'dynamodb:Query',
            // S3
            's3:Get*',
            's3:List*',
            's3:Describe*',
            // EC2 / VPC
            'ec2:Describe*',
            'ec2:Get*',
            // Route53
            'route53:Get*',
            'route53:List*',
            'route53:TestDNSAnswer',
            // ACM
            'acm:Describe*',
            'acm:List*',
            'acm:GetCertificate',
            // SNS / SQS / EventBridge
            'sns:Get*',
            'sns:List*',
            'sqs:Get*',
            'sqs:List*',
            'events:Describe*',
            'events:List*',
            'events:TestEventPattern',
            // SSM (SecureString の復号は KMS Deny で遮断される)
            'ssm:Describe*',
            'ssm:List*',
            'ssm:Get*',
            // KMS (メタデータのみ。Decrypt は別途 Deny)
            'kms:Describe*',
            'kms:List*',
            'kms:Get*',
            // IAM (構成把握用の Read のみ)
            'iam:Get*',
            'iam:List*',
            'iam:GenerateServiceLastAccessedDetails',
            'iam:SimulatePrincipalPolicy',
            'iam:SimulateCustomPolicy',
            // Application Auto Scaling
            'application-autoscaling:Describe*',
            // STS (自分の identity 確認用)
            'sts:GetCallerIdentity',
          ],
          resources: ['*'],
        }),
        // 機密値の取得を遮断
        new iam.PolicyStatement({
          sid: 'DenySecretRetrieval',
          effect: iam.Effect.DENY,
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:GetRandomPassword',
          ],
          resources: ['*'],
        }),
        // 復号経路を遮断（SecureString パラメータの値取得もこれで防げる）
        // ただし DynamoDB 経由の復号（kms:ViaService = dynamodb.*）は例外として Allow を別途許可
        new iam.PolicyStatement({
          sid: 'DenyKmsDataOperations',
          effect: iam.Effect.DENY,
          actions: [
            'kms:Decrypt',
            'kms:Encrypt',
            'kms:ReEncrypt*',
            'kms:GenerateDataKey',
            'kms:GenerateDataKey*',
            'kms:GenerateRandom',
          ],
          resources: ['*'],
          conditions: {
            StringNotEqualsIfExists: {
              'kms:ViaService': ['dynamodb.us-east-1.amazonaws.com'],
            },
          },
        }),
        // DynamoDB が KMS 暗号化テーブルを読む際に内部で呼び出す Decrypt を許可
        // kms:ViaService 条件で DynamoDB 経由のみに限定（CLI 直叩きや他サービス経由は許可されない）
        new iam.PolicyStatement({
          sid: 'AllowKmsDecryptViaDynamoDB',
          effect: iam.Effect.ALLOW,
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': ['dynamodb.us-east-1.amazonaws.com'],
            },
          },
        }),
        // PII を含む auth-users テーブルへの読み取りを遮断
        new iam.PolicyStatement({
          sid: 'DenyAuthUsersTableAccess',
          effect: iam.Effect.DENY,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Scan',
            'dynamodb:Query',
          ],
          resources: [
            'arn:aws:dynamodb:*:*:table/nagiyu-auth-users-*',
            'arn:aws:dynamodb:*:*:table/nagiyu-auth-users-*/index/*',
          ],
        }),
      ],
    });

    new cdk.CfnOutput(this, 'ClaudeReadonlyPolicyArnExport', {
      value: this.policy.managedPolicyArn,
      description: 'Claude readonly policy ARN for nagiyu',
    });
  }
}
