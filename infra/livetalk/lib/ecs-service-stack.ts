import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  Environment,
  SSM_PARAMETERS,
  getEcrRepositoryName,
} from '@nagiyu/infra-common';

export interface LiveTalkEcsServiceStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk ECS Service スタック
 *
 * - 共通 ECS Cluster（`nagiyu-shared-cluster-{env}`）に Attach
 * - Task Definition: Next.js 単一コンテナ（port 3000）
 *   Phase 1f で同一 Task 内に VOICEVOX コンテナを追加できる構成にしておく
 * - Service: 1 タスク稼働、health check grace period 60s、ALB Target Group へ登録
 * - SSM Parameter に Service 名を出力
 * - Component: livetalk タグを付与
 *
 * イメージタグは `IMAGE_TAG` 環境変数から取得し、Task Definition のリビジョンが
 * 更新されるたびに force-new-deployment でローリングデプロイされる想定。
 */
export class LiveTalkEcsServiceStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly ecsTaskSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: LiveTalkEcsServiceStackProps) {
    super(scope, id, props);

    const { environment } = props;

    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(environment)
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment)
    );

    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      publicSubnetIds: [
        cdk.Fn.select(0, publicSubnetIds),
        cdk.Fn.select(1, publicSubnetIds),
      ],
    });

    const clusterName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.SHARED_ECS_CLUSTER_NAME(environment)
    );
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedSharedCluster', {
      clusterName,
      vpc,
      securityGroups: [],
    });

    const albSecurityGroupId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_SECURITY_GROUP_ID(environment)
    );
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      albSecurityGroupId
    );

    const targetGroupArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_TARGET_GROUP_ARN(environment)
    );
    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'ImportedTargetGroup',
      {
        targetGroupArn,
      }
    );

    this.ecsTaskSecurityGroup = new ec2.SecurityGroup(this, 'EcsTaskSecurityGroup', {
      vpc,
      securityGroupName: `nagiyu-livetalk-task-sg-${environment}`,
      description: 'Security group for LiveTalk ECS Tasks',
      allowAllOutbound: true,
    });

    this.ecsTaskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from LiveTalk ALB'
    );

    const logGroup = new logs.LogGroup(this, 'EcsTaskLogGroup', {
      logGroupName: `/ecs/nagiyu-livetalk-task-${environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Execution Role for LiveTalk',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    const ecrRepoName = getEcrRepositoryName('livetalk', environment);
    const ecrRepositoryArn = `arn:aws:ecr:${this.region}:${this.account}:repository/${ecrRepoName}`;

    taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: [ecrRepositoryArn],
      })
    );

    // ECR GetAuthorizationToken は AWS の仕様上 resource: * を要求する
    taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Role for LiveTalk',
    });

    const ecrRepositoryUri = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${ecrRepoName}`;

    const imageTag = process.env.IMAGE_TAG || 'latest';

    // Phase 1f で VOICEVOX コンテナを同一 Task に追加できるよう、CPU/メモリは Next.js 単体の
    // 必要量 + VOICEVOX 想定（CPU 1024 / メモリ 2048）に対応できる枠を確保しておく。
    // Phase 1c 時点では Next.js 1 コンテナのみだが、リソース枠は将来分も見込んで設定する。
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `nagiyu-livetalk-task-${environment}`,
      cpu: 1024,
      memoryLimitMiB: 2048,
      executionRole: taskExecutionRole,
      taskRole,
    });

    this.taskDefinition.addContainer('livetalk-web', {
      containerName: 'livetalk-web',
      image: ecs.ContainerImage.fromRegistry(`${ecrRepositoryUri}:${imageTag}`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logGroup,
      }),
      environment: {
        NODE_ENV: environment === 'prod' ? 'production' : 'development',
        PORT: '3000',
      },
      portMappings: [
        {
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // VOICEVOX 同居（Phase 1f）を見越して startPeriod は 60s 以上を要件にしているが、
    // Phase 1c 時点では Next.js 単体なので Service の healthCheckGracePeriod のみで対応。
    this.service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: this.taskDefinition,
      serviceName: `nagiyu-livetalk-service-${environment}`,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.ecsTaskSecurityGroup],
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    this.service.attachToApplicationTargetGroup(targetGroup);

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'LiveTalk ECS Service name',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'LiveTalk ECS Service ARN',
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'LiveTalk Task Definition ARN',
    });

    new cdk.CfnOutput(this, 'TaskSecurityGroupId', {
      value: this.ecsTaskSecurityGroup.securityGroupId,
      description: 'LiveTalk ECS Task Security Group ID',
    });

    new ssm.StringParameter(this, 'ServiceNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ECS_SERVICE_NAME(environment),
      stringValue: this.service.serviceName,
      description: 'LiveTalk ECS Service name',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
