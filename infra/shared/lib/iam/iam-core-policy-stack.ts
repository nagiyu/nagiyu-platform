import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

/**
 * IAM Core Policy Stack
 *
 * コアデプロイ権限（CloudFormation, IAM, Network, Logs）を管理します。
 */
export class IamCorePolicyStack extends cdk.Stack {
  public readonly policy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.policy = new iam.ManagedPolicy(this, 'NagiyuDeployPolicyCore', {
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

    new cdk.CfnOutput(this, 'CorePolicyArnExport', {
      value: this.policy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_CORE_ARN,
      description: 'Core deploy policy ARN for nagiyu',
    });
  }
}
