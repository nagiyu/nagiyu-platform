import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

/**
 * IAM Policies Stack
 *
 * デプロイに必要な IAM マネージドポリシーを管理します。
 * ポリシーサイズ制限（6144文字）により、4つのポリシーに分割しています。
 */
export class IamPoliciesStack extends cdk.Stack {
  public readonly corePolicy: iam.IManagedPolicy;
  public readonly applicationPolicy: iam.IManagedPolicy;
  public readonly containerPolicy: iam.IManagedPolicy;
  public readonly integrationPolicy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ==========================================
    // Core Policy
    // ==========================================
    this.corePolicy = new iam.ManagedPolicy(this, 'NagiyuDeployPolicyCore', {
      managedPolicyName: 'nagiyu-deploy-policy-core',
      description:
        'nagiyu コアデプロイ権限（CloudFormation, IAM, Network, Logs）',
      statements: [
        // CloudFormation Operations
        new iam.PolicyStatement({
          sid: 'CloudFormationOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DeleteStack',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackEvents',
            'cloudformation:DescribeStackResources',
            'cloudformation:GetTemplate',
            'cloudformation:GetTemplateSummary',
            'cloudformation:ValidateTemplate',
            'cloudformation:CreateChangeSet',
            'cloudformation:DescribeChangeSet',
            'cloudformation:ExecuteChangeSet',
            'cloudformation:DeleteChangeSet',
            'cloudformation:ListExports',
          ],
          resources: ['*'],
        }),
        // CDK Bootstrap Role Assumption
        new iam.PolicyStatement({
          sid: 'CDKBootstrapRoleAssumption',
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [`arn:aws:iam::*:role/cdk-hnb659fds-*`],
          conditions: {
            StringEquals: {
              'aws:PrincipalAccount': this.account,
            },
          },
        }),
        // IAM Role and Policy Management
        new iam.PolicyStatement({
          sid: 'IAMRoleAndPolicyManagement',
          effect: iam.Effect.ALLOW,
          actions: [
            // Role operations
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:GetRole',
            'iam:TagRole',
            'iam:ListRolePolicies',
            'iam:GetRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            // Policy operations
            'iam:CreatePolicy',
            'iam:DeletePolicy',
            'iam:GetPolicy',
            'iam:GetPolicyVersion',
            'iam:ListPolicyVersions',
            'iam:CreatePolicyVersion',
            'iam:DeletePolicyVersion',
            // User operations
            'iam:CreateUser',
            'iam:DeleteUser',
            'iam:GetUser',
            'iam:ListUsers',
            'iam:TagUser',
            'iam:ListUserPolicies',
            'iam:GetUserPolicy',
            'iam:PutUserPolicy',
            'iam:AttachUserPolicy',
            'iam:DetachUserPolicy',
            // Access key operations
            'iam:ListAccessKeys',
            'iam:CreateAccessKey',
            'iam:DeleteAccessKey',
            'iam:GetAccessKeyLastUsed',
            // Group operations
            'iam:ListGroups',
            'iam:GetGroup',
            'iam:ListGroupPolicies',
            'iam:GetGroupPolicy',
            // Service-linked role
            'iam:CreateServiceLinkedRole',
          ],
          resources: ['*'],
        }),
        // IAM PassRole
        new iam.PolicyStatement({
          sid: 'IAMPassRole',
          effect: iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'iam:PassedToService': [
                'lambda.amazonaws.com',
                'batch.amazonaws.com',
                'ecs.amazonaws.com',
                'ecs-tasks.amazonaws.com',
                'events.amazonaws.com',
                'application-autoscaling.amazonaws.com',
                'cloudformation.amazonaws.com',
              ],
            },
          },
        }),
        // Network Operations
        new iam.PolicyStatement({
          sid: 'NetworkOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            // VPC
            'ec2:CreateVpc',
            'ec2:DeleteVpc',
            'ec2:DescribeVpcs',
            'ec2:ModifyVpcAttribute',
            // Subnet
            'ec2:CreateSubnet',
            'ec2:DeleteSubnet',
            'ec2:DescribeSubnets',
            'ec2:ModifySubnetAttribute',
            // Internet Gateway
            'ec2:CreateInternetGateway',
            'ec2:DeleteInternetGateway',
            'ec2:AttachInternetGateway',
            'ec2:DetachInternetGateway',
            'ec2:DescribeInternetGateways',
            // NAT Gateway
            'ec2:CreateNatGateway',
            'ec2:DeleteNatGateway',
            'ec2:DescribeNatGateways',
            // Elastic IP
            'ec2:AllocateAddress',
            'ec2:ReleaseAddress',
            'ec2:DescribeAddresses',
            'ec2:AssociateAddress',
            'ec2:DisassociateAddress',
            // Route Table
            'ec2:CreateRouteTable',
            'ec2:DeleteRouteTable',
            'ec2:DescribeRouteTables',
            'ec2:AssociateRouteTable',
            'ec2:DisassociateRouteTable',
            'ec2:CreateRoute',
            'ec2:DeleteRoute',
            'ec2:ReplaceRoute',
            // Security Group
            'ec2:CreateSecurityGroup',
            'ec2:DeleteSecurityGroup',
            'ec2:DescribeSecurityGroups',
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:AuthorizeSecurityGroupEgress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupEgress',
            'ec2:UpdateSecurityGroupRuleDescriptionsIngress',
            'ec2:UpdateSecurityGroupRuleDescriptionsEgress',
            // EC2 instances (for Batch compute resources)
            'ec2:DescribeInstances',
            'ec2:RunInstances',
            'ec2:TerminateInstances',
            'ec2:DescribeInstanceTypes',
            'ec2:DescribeInstanceAttribute',
            // Tags
            'ec2:CreateTags',
            'ec2:DeleteTags',
            'ec2:DescribeTags',
            // Network Interfaces
            'ec2:DescribeNetworkInterfaces',
            'ec2:CreateNetworkInterface',
            'ec2:DeleteNetworkInterface',
          ],
          resources: ['*'],
        }),
        // CloudWatch Logs Operations
        new iam.PolicyStatement({
          sid: 'CloudWatchLogsOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            // Log Group
            'logs:CreateLogGroup',
            'logs:DeleteLogGroup',
            'logs:DescribeLogGroups',
            'logs:PutRetentionPolicy',
            'logs:DeleteRetentionPolicy',
            // Log Stream
            'logs:CreateLogStream',
            'logs:DeleteLogStream',
            'logs:DescribeLogStreams',
            // Log Events
            'logs:PutLogEvents',
            'logs:GetLogEvents',
            // Tags
            'logs:TagResource',
            'logs:UntagResource',
            'logs:ListTagsForResource',
          ],
          resources: ['*'],
        }),
      ],
    });

    // ==========================================
    // Application Policy
    // ==========================================
    this.applicationPolicy = new iam.ManagedPolicy(
      this,
      'NagiyuDeployPolicyApplication',
      {
        managedPolicyName: 'nagiyu-deploy-policy-application',
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

    // ==========================================
    // Container Policy
    // ==========================================
    this.containerPolicy = new iam.ManagedPolicy(
      this,
      'NagiyuDeployPolicyContainer',
      {
        managedPolicyName: 'nagiyu-deploy-policy-container',
        description: 'nagiyu コンテナデプロイ権限（ECR, ECS, Batch）',
        statements: [
          // ECR Operations
          new iam.PolicyStatement({
            sid: 'ECROperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Authentication
              'ecr:GetAuthorizationToken',
              // Repository management
              'ecr:CreateRepository',
              'ecr:DeleteRepository',
              'ecr:DescribeRepositories',
              'ecr:TagResource',
              'ecr:UntagResource',
              'ecr:ListTagsForResource',
              // Image operations
              'ecr:BatchCheckLayerAvailability',
              'ecr:BatchGetImage',
              'ecr:GetDownloadUrlForLayer',
              'ecr:PutImage',
              'ecr:InitiateLayerUpload',
              'ecr:UploadLayerPart',
              'ecr:CompleteLayerUpload',
              'ecr:ListImages',
              'ecr:DescribeImages',
              // Repository policy
              'ecr:GetRepositoryPolicy',
              'ecr:SetRepositoryPolicy',
              'ecr:DeleteRepositoryPolicy',
              // Lifecycle policy
              'ecr:PutLifecyclePolicy',
              'ecr:GetLifecyclePolicy',
              'ecr:DeleteLifecyclePolicy',
            ],
            resources: ['*'],
          }),
          // ECS Operations
          new iam.PolicyStatement({
            sid: 'ECSOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Cluster
              'ecs:CreateCluster',
              'ecs:DeleteCluster',
              'ecs:DescribeClusters',
              'ecs:ListClusters',
              'ecs:PutClusterCapacityProviders',
              // Task Definition
              'ecs:RegisterTaskDefinition',
              'ecs:DeregisterTaskDefinition',
              'ecs:DescribeTaskDefinition',
              'ecs:ListTaskDefinitions',
              'ecs:ListTaskDefinitionFamilies',
              // Service
              'ecs:CreateService',
              'ecs:UpdateService',
              'ecs:DeleteService',
              'ecs:DescribeServices',
              'ecs:ListServices',
              // Task
              'ecs:RunTask',
              'ecs:StopTask',
              'ecs:DescribeTasks',
              'ecs:ListTasks',
              // Container Instance
              'ecs:DescribeContainerInstances',
              'ecs:ListContainerInstances',
              // Tags
              'ecs:TagResource',
              'ecs:UntagResource',
              'ecs:ListTagsForResource',
            ],
            resources: ['*'],
          }),
          // Batch Operations
          new iam.PolicyStatement({
            sid: 'BatchOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Compute Environment
              'batch:CreateComputeEnvironment',
              'batch:DeleteComputeEnvironment',
              'batch:UpdateComputeEnvironment',
              'batch:DescribeComputeEnvironments',
              // Job Queue
              'batch:CreateJobQueue',
              'batch:DeleteJobQueue',
              'batch:UpdateJobQueue',
              'batch:DescribeJobQueues',
              // Job Definition
              'batch:RegisterJobDefinition',
              'batch:DeregisterJobDefinition',
              'batch:DescribeJobDefinitions',
              // Tags
              'batch:TagResource',
              'batch:UntagResource',
            ],
            resources: ['*'],
          }),
        ],
      }
    );

    // ==========================================
    // Integration Policy
    // ==========================================
    this.integrationPolicy = new iam.ManagedPolicy(
      this,
      'NagiyuDeployPolicyIntegration',
      {
        managedPolicyName: 'nagiyu-deploy-policy-integration',
        description:
          'nagiyu 統合・セキュリティデプロイ権限（KMS, Secrets, SSM, SNS, SQS, EventBridge, Auto Scaling）',
        statements: [
          // KMS Operations
          new iam.PolicyStatement({
            sid: 'KMSOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Key management
              'kms:CreateKey',
              'kms:DescribeKey',
              'kms:ListKeys',
              'kms:ListAliases',
              'kms:ScheduleKeyDeletion',
              'kms:CancelKeyDeletion',
              // Key policy
              'kms:GetKeyPolicy',
              'kms:PutKeyPolicy',
              // Key rotation
              'kms:EnableKeyRotation',
              'kms:DisableKeyRotation',
              'kms:GetKeyRotationStatus',
              // Alias
              'kms:CreateAlias',
              'kms:DeleteAlias',
              'kms:UpdateAlias',
              // Grants
              'kms:CreateGrant',
              'kms:RetireGrant',
              'kms:RevokeGrant',
              'kms:ListGrants',
              // Tags
              'kms:TagResource',
              'kms:UntagResource',
              'kms:ListResourceTags',
              // Cryptographic operations (for CloudFormation resource property encryption)
              'kms:Decrypt',
              'kms:Encrypt',
              'kms:GenerateDataKey',
            ],
            resources: ['*'],
          }),
          // Secrets Manager Operations
          new iam.PolicyStatement({
            sid: 'SecretsManagerOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Secret management
              'secretsmanager:CreateSecret',
              'secretsmanager:DeleteSecret',
              'secretsmanager:DescribeSecret',
              'secretsmanager:ListSecrets',
              'secretsmanager:GetSecretValue',
              'secretsmanager:PutSecretValue',
              'secretsmanager:UpdateSecret',
              'secretsmanager:RestoreSecret',
              // Rotation
              'secretsmanager:RotateSecret',
              'secretsmanager:CancelRotateSecret',
              // Resource policy
              'secretsmanager:GetResourcePolicy',
              'secretsmanager:PutResourcePolicy',
              'secretsmanager:DeleteResourcePolicy',
              // Tags
              'secretsmanager:TagResource',
              'secretsmanager:UntagResource',
            ],
            resources: ['*'],
          }),
          // Systems Manager Operations
          new iam.PolicyStatement({
            sid: 'SystemsManagerOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Parameter Store
              'ssm:PutParameter',
              'ssm:GetParameter',
              'ssm:GetParameters',
              'ssm:GetParametersByPath',
              'ssm:DeleteParameter',
              'ssm:DeleteParameters',
              'ssm:DescribeParameters',
              // Parameter history
              'ssm:GetParameterHistory',
              // Tags
              'ssm:AddTagsToResource',
              'ssm:RemoveTagsFromResource',
              'ssm:ListTagsForResource',
            ],
            resources: ['*'],
          }),
          // SNS Operations
          new iam.PolicyStatement({
            sid: 'SNSOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Topic management
              'sns:CreateTopic',
              'sns:DeleteTopic',
              'sns:GetTopicAttributes',
              'sns:SetTopicAttributes',
              'sns:ListTopics',
              // Subscription
              'sns:Subscribe',
              'sns:Unsubscribe',
              'sns:ListSubscriptions',
              'sns:ListSubscriptionsByTopic',
              'sns:GetSubscriptionAttributes',
              'sns:SetSubscriptionAttributes',
              // Publishing (for CloudFormation notifications)
              'sns:Publish',
              // Tags
              'sns:TagResource',
              'sns:UntagResource',
              'sns:ListTagsForResource',
            ],
            resources: ['*'],
          }),
          // SQS Operations
          new iam.PolicyStatement({
            sid: 'SQSOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Queue management
              'sqs:CreateQueue',
              'sqs:DeleteQueue',
              'sqs:GetQueueAttributes',
              'sqs:SetQueueAttributes',
              'sqs:ListQueues',
              'sqs:GetQueueUrl',
              // Message operations (for CloudFormation and testing)
              'sqs:SendMessage',
              'sqs:ReceiveMessage',
              'sqs:DeleteMessage',
              'sqs:PurgeQueue',
              // Tags
              'sqs:TagQueue',
              'sqs:UntagQueue',
              'sqs:ListQueueTags',
            ],
            resources: ['*'],
          }),
          // EventBridge Operations
          new iam.PolicyStatement({
            sid: 'EventBridgeOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Event Bus
              'events:CreateEventBus',
              'events:DeleteEventBus',
              'events:DescribeEventBus',
              'events:ListEventBuses',
              // Rules
              'events:PutRule',
              'events:DeleteRule',
              'events:DescribeRule',
              'events:ListRules',
              'events:EnableRule',
              'events:DisableRule',
              // Targets
              'events:PutTargets',
              'events:RemoveTargets',
              'events:ListTargetsByRule',
              // Event patterns
              'events:TestEventPattern',
              // Tags
              'events:TagResource',
              'events:UntagResource',
              'events:ListTagsForResource',
            ],
            resources: ['*'],
          }),
          // Application Auto Scaling Operations
          new iam.PolicyStatement({
            sid: 'ApplicationAutoScalingOperations',
            effect: iam.Effect.ALLOW,
            actions: [
              // Scalable Target
              'application-autoscaling:RegisterScalableTarget',
              'application-autoscaling:DeregisterScalableTarget',
              'application-autoscaling:DescribeScalableTargets',
              // Scaling Policy
              'application-autoscaling:PutScalingPolicy',
              'application-autoscaling:DeleteScalingPolicy',
              'application-autoscaling:DescribeScalingPolicies',
              // Scheduled Action
              'application-autoscaling:PutScheduledAction',
              'application-autoscaling:DeleteScheduledAction',
              'application-autoscaling:DescribeScheduledActions',
              // Tags
              'application-autoscaling:TagResource',
              'application-autoscaling:UntagResource',
              'application-autoscaling:ListTagsForResource',
            ],
            resources: ['*'],
          }),
        ],
      }
    );

    // ==========================================
    // Exports
    // ==========================================
    new cdk.CfnOutput(this, 'CorePolicyArnExport', {
      value: this.corePolicy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_CORE_ARN,
      description: 'Core deploy policy ARN for nagiyu',
    });

    new cdk.CfnOutput(this, 'ApplicationPolicyArnExport', {
      value: this.applicationPolicy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_APPLICATION_ARN,
      description: 'Application deploy policy ARN for nagiyu',
    });

    new cdk.CfnOutput(this, 'ContainerPolicyArnExport', {
      value: this.containerPolicy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_CONTAINER_ARN,
      description: 'Container deploy policy ARN for nagiyu',
    });

    new cdk.CfnOutput(this, 'IntegrationPolicyArnExport', {
      value: this.integrationPolicy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_INTEGRATION_ARN,
      description: 'Integration and security deploy policy ARN for nagiyu',
    });
  }
}
