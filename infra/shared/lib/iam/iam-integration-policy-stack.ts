import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

/**
 * IAM Integration Policy Stack
 *
 * 統合・セキュリティデプロイ権限（KMS, Secrets, SSM, SNS, SQS, EventBridge, Auto Scaling）を管理します。
 */
export class IamIntegrationPolicyStack extends cdk.Stack {
  public readonly policy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.policy = new iam.ManagedPolicy(
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

    new cdk.CfnOutput(this, 'IntegrationPolicyArnExport', {
      value: this.policy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_INTEGRATION_ARN,
      description: 'Integration and security deploy policy ARN for nagiyu',
    });
  }
}
