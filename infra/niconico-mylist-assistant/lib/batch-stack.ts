import * as cdk from 'aws-cdk-lib';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { getEcrRepositoryName, getDynamoDBTableName } from '@nagiyu/infra-common';
import { BatchJobRole } from './roles/batch-job-role';

export interface BatchStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * niconico-mylist-assistant サービス用の AWS Batch スタック
 *
 * Fargate を使用した AWS Batch 環境を構築します。
 * 最小リソース設定（vCPU 0.25, メモリ 512 MB）で、
 * ダミー処理を実行するための基盤を提供します。
 */
export class BatchStack extends cdk.Stack {
  public readonly jobQueueArn: string;
  public readonly jobDefinitionArn: string;

  constructor(scope: Construct, id: string, props: BatchStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const env = environment as 'dev' | 'prod';

    // ECR リポジトリの参照
    const batchEcrRepositoryName = getEcrRepositoryName(
      'niconico-mylist-assistant-batch',
      env
    );
    const batchEcrRepository = ecr.Repository.fromRepositoryName(
      this,
      'BatchEcrRepository',
      batchEcrRepositoryName
    );

    // DynamoDB テーブル名の取得
    const tableName = getDynamoDBTableName('niconico-mylist-assistant', env);

    // 共有 VPC の参照
    const vpc = ec2.Vpc.fromLookup(this, 'SharedVpc', {
      tags: {
        Name: `nagiyu-${env}-vpc`,
      },
    });

    // Public Subnet の取得
    const publicSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PUBLIC,
    });

    // Security Group の作成（アウトバウンド HTTPS のみ）
    const batchSecurityGroup = new ec2.SecurityGroup(this, 'BatchSecurityGroup', {
      vpc: vpc,
      description: 'Security group for Batch Fargate tasks - HTTPS outbound only',
      allowAllOutbound: false,
    });

    // アウトバウンド HTTPS のみ許可
    batchSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS outbound'
    );

    // IAM Role for Batch Job Execution (イメージの Pull など)
    const batchJobExecutionRole = new iam.Role(this, 'BatchJobExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Execution role for Batch job tasks',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    // Grant Batch job access to ECR
    batchEcrRepository.grantPull(batchJobExecutionRole);

    // IAM Role for Batch Job (コンテナランタイム用、最小権限)
    const batchJobRole = new BatchJobRole(this, 'BatchJobRole');

    // CloudWatch Log Group for Batch
    const batchLogGroup = new logs.LogGroup(this, 'BatchLogGroup', {
      logGroupName: `/aws/batch/niconico-mylist-assistant-${env}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Batch Compute Environment (Fargate) - L1 construct for assignPublicIp support
    const computeEnvironment = new batch.CfnComputeEnvironment(this, 'ComputeEnvironment', {
      computeEnvironmentName: `niconico-mylist-assistant-${env}`,
      type: 'MANAGED',
      state: 'ENABLED',
      computeResources: {
        type: 'FARGATE',
        maxvCpus: 1, // 最小リソース設定: 0.25 vCPU × 4 = 1 vCPU max
        subnets: publicSubnets.subnetIds,
        securityGroupIds: [batchSecurityGroup.securityGroupId],
      },
    });

    // Batch Job Queue - L1 construct
    const jobQueue = new batch.CfnJobQueue(this, 'JobQueue', {
      jobQueueName: `niconico-mylist-assistant-${env}`,
      priority: 1,
      state: 'ENABLED',
      computeEnvironmentOrder: [
        {
          computeEnvironment: computeEnvironment.attrComputeEnvironmentArn,
          order: 1,
        },
      ],
    });

    // Batch Job Definition - L1 construct for AssignPublicIp support
    const batchImageTag = this.node.tryGetContext('batchImageTag') || 'latest';
    const jobDefinition = new batch.CfnJobDefinition(this, 'JobDefinition', {
      jobDefinitionName: `niconico-mylist-assistant-${env}`,
      type: 'container',
      platformCapabilities: ['FARGATE'],
      containerProperties: {
        image: `${batchEcrRepository.repositoryUri}:${batchImageTag}`,
        resourceRequirements: [
          {
            type: 'VCPU',
            value: '0.25', // 最小リソース設定
          },
          {
            type: 'MEMORY',
            value: '512', // 最小リソース設定 (MB)
          },
        ],
        executionRoleArn: batchJobExecutionRole.roleArn,
        jobRoleArn: batchJobRole.roleArn,
        networkConfiguration: {
          assignPublicIp: 'ENABLED',
        },
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group': batchLogGroup.logGroupName,
            'awslogs-region': this.region,
            'awslogs-stream-prefix': 'batch',
          },
        },
        environment: [
          {
            name: 'DYNAMODB_TABLE_NAME',
            value: tableName,
          },
          {
            name: 'AWS_REGION',
            value: this.region,
          },
        ],
      },
      retryStrategy: {
        attempts: 1, // リトライなし（初期実装）
      },
      timeout: {
        attemptDurationSeconds: 900, // 15分タイムアウト
      },
    });

    // Export values for other stacks
    this.jobQueueArn = jobQueue.attrJobQueueArn;
    this.jobDefinitionArn = jobDefinition.attrJobDefinitionArn;

    // Outputs
    new cdk.CfnOutput(this, 'BatchJobQueueArn', {
      value: jobQueue.attrJobQueueArn,
      description: 'Batch job queue ARN',
      exportName: `${this.stackName}-JobQueueArn`,
    });

    new cdk.CfnOutput(this, 'BatchJobDefinitionArn', {
      value: jobDefinition.attrJobDefinitionArn,
      description: 'Batch job definition ARN',
      exportName: `${this.stackName}-JobDefinitionArn`,
    });

    new cdk.CfnOutput(this, 'BatchLogGroupName', {
      value: batchLogGroup.logGroupName,
      description: 'CloudWatch Logs group name for Batch',
      exportName: `${this.stackName}-LogGroupName`,
    });

    new cdk.CfnOutput(this, 'BatchSecurityGroupId', {
      value: batchSecurityGroup.securityGroupId,
      description: 'Security group ID for Batch tasks',
      exportName: `${this.stackName}-SecurityGroupId`,
    });

    // タグの追加
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this).add('Environment', environment);
  }
}
