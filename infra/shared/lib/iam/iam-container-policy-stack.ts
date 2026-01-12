import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

/**
 * IAM Container Policy Stack
 *
 * コンテナデプロイ権限（ECR, ECS, Batch）を管理します。
 */
export class IamContainerPolicyStack extends cdk.Stack {
  public readonly policy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.policy = new iam.ManagedPolicy(this, 'Policy', {
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

    new cdk.CfnOutput(this, 'ContainerPolicyArnExport', {
      value: this.policy.managedPolicyArn,
      exportName: EXPORTS.DEPLOY_POLICY_CONTAINER_ARN,
      description: 'Container deploy policy ARN for nagiyu',
    });
  }
}
