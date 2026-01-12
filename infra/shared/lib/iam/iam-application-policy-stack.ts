import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

/**
 * IAM Application Policy Stack
 *
 * アプリケーションデプロイ権限（Lambda, S3, DynamoDB, API Gateway, CloudFront）を管理します。
 */
export class IamApplicationPolicyStack extends cdk.Stack {
  public readonly policy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.policy = new iam.ManagedPolicy(this, 'Policy', {
      description:
        'nagiyu アプリケーションデプロイ権限（Lambda, S3, DynamoDB, API Gateway, CloudFront）',
      statements: [
          // S3 Operations
          new iam.PolicyStatement({
            sid: 'S3Operations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Bucket management
              's3:CreateBucket',
              's3:DeleteBucket',
              's3:ListAllMyBuckets',
              's3:GetBucketLocation',
              // Bucket configuration
              's3:PutBucketPolicy',
              's3:GetBucketPolicy',
              's3:DeleteBucketPolicy',
              's3:PutBucketTagging',
              's3:GetBucketTagging',
              's3:PutBucketVersioning',
              's3:GetBucketVersioning',
              's3:PutEncryptionConfiguration',
              's3:GetEncryptionConfiguration',
              's3:PutLifecycleConfiguration',
              's3:GetLifecycleConfiguration',
              's3:PutBucketCORS',
              's3:GetBucketCORS',
              's3:PutBucketPublicAccessBlock',
              's3:GetBucketPublicAccessBlock',
              // Object operations
              's3:PutObject',
              's3:GetObject',
              's3:DeleteObject',
              's3:ListBucket',
              // Multipart upload
              's3:ListBucketMultipartUploads',
              's3:AbortMultipartUpload',
            ],
            resources: ['*'],
          }),
          // DynamoDB Operations
          new iam.PolicyStatement({
            sid: 'DynamoDBOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Table management
              'dynamodb:CreateTable',
              'dynamodb:DeleteTable',
              'dynamodb:UpdateTable',
              'dynamodb:DescribeTable',
              'dynamodb:ListTables',
              // TTL
              'dynamodb:UpdateTimeToLive',
              'dynamodb:DescribeTimeToLive',
              // Backup
              'dynamodb:UpdateContinuousBackups',
              'dynamodb:DescribeContinuousBackups',
              // Tags
              'dynamodb:TagResource',
              'dynamodb:UntagResource',
              'dynamodb:ListTagsOfResource',
            ],
            resources: ['*'],
          }),
          // Lambda Operations
          new iam.PolicyStatement({
            sid: 'LambdaOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Function management
              'lambda:CreateFunction',
              'lambda:DeleteFunction',
              'lambda:GetFunction',
              'lambda:GetFunctionConfiguration',
              'lambda:UpdateFunctionCode',
              'lambda:UpdateFunctionConfiguration',
              'lambda:ListFunctions',
              // Versioning
              'lambda:PublishVersion',
              'lambda:ListVersionsByFunction',
              // Aliases
              'lambda:CreateAlias',
              'lambda:UpdateAlias',
              'lambda:DeleteAlias',
              'lambda:GetAlias',
              'lambda:ListAliases',
              // Permissions
              'lambda:AddPermission',
              'lambda:RemovePermission',
              'lambda:GetPolicy',
              // Function URL
              'lambda:CreateFunctionUrlConfig',
              'lambda:UpdateFunctionUrlConfig',
              'lambda:DeleteFunctionUrlConfig',
              'lambda:GetFunctionUrlConfig',
              // Tags
              'lambda:TagResource',
              'lambda:UntagResource',
              'lambda:ListTags',
            ],
            resources: ['*'],
          }),
          // ACM Operations
          new iam.PolicyStatement({
            sid: 'ACMOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Certificate management
              'acm:RequestCertificate',
              'acm:DeleteCertificate',
              'acm:DescribeCertificate',
              'acm:ListCertificates',
              // Tags
              'acm:AddTagsToCertificate',
              'acm:RemoveTagsFromCertificate',
              'acm:ListTagsForCertificate',
            ],
            resources: ['*'],
          }),
          // CloudFront Operations
          new iam.PolicyStatement({
            sid: 'CloudFrontOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Distribution management
              'cloudfront:CreateDistribution',
              'cloudfront:UpdateDistribution',
              'cloudfront:DeleteDistribution',
              'cloudfront:GetDistribution',
              'cloudfront:GetDistributionConfig',
              'cloudfront:ListDistributions',
              // Invalidation
              'cloudfront:CreateInvalidation',
              'cloudfront:GetInvalidation',
              'cloudfront:ListInvalidations',
              // Tags
              'cloudfront:TagResource',
              'cloudfront:UntagResource',
              'cloudfront:ListTagsForResource',
            ],
            resources: ['*'],
          }),
          // API Gateway Operations
          new iam.PolicyStatement({
            sid: 'APIGatewayOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // API management (HTTP API / WebSocket API)
              'apigatewayv2:CreateApi',
              'apigatewayv2:UpdateApi',
              'apigatewayv2:DeleteApi',
              'apigatewayv2:GetApi',
              'apigatewayv2:GetApis',
              // Route
              'apigatewayv2:CreateRoute',
              'apigatewayv2:UpdateRoute',
              'apigatewayv2:DeleteRoute',
              'apigatewayv2:GetRoute',
              'apigatewayv2:GetRoutes',
              // Integration
              'apigatewayv2:CreateIntegration',
              'apigatewayv2:UpdateIntegration',
              'apigatewayv2:DeleteIntegration',
              'apigatewayv2:GetIntegration',
              'apigatewayv2:GetIntegrations',
              // Stage
              'apigatewayv2:CreateStage',
              'apigatewayv2:UpdateStage',
              'apigatewayv2:DeleteStage',
              'apigatewayv2:GetStage',
              'apigatewayv2:GetStages',
              // Deployment
              'apigatewayv2:CreateDeployment',
              'apigatewayv2:GetDeployment',
              'apigatewayv2:GetDeployments',
              // Tags
              'apigatewayv2:TagResource',
              'apigatewayv2:UntagResource',
              'apigatewayv2:GetTags',
            ],
            resources: ['*'],
          }),
        ],
      }
    );

    new cdk.CfnOutput(this, 'ApplicationPolicyArnExport', {
      value: this.policy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_APPLICATION_ARN,
      description: 'Application deploy policy ARN for nagiyu',
    });
  }
}
