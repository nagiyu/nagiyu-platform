import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../common/src/utils/ssm';
import { getEcrRepositoryName } from '../common/src/utils/naming';

export interface EcsServiceStackProps extends cdk.StackProps {
  environment: string;
}

export class EcsServiceStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: EcsServiceStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Import VPC from SSM Parameter Store
    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(environment as 'dev' | 'prod')
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment as 'dev' | 'prod')
    );

    // For prod, subnet IDs are comma-separated; for dev, it's a single ID
    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);

    // Configure VPC attributes based on environment
    const vpcAttributes =
      environment === 'prod'
        ? {
            vpcId,
            availabilityZones: ['us-east-1a', 'us-east-1b'],
            publicSubnetIds: [
              cdk.Fn.select(0, publicSubnetIds),
              cdk.Fn.select(1, publicSubnetIds),
            ],
          }
        : {
            vpcId,
            availabilityZones: ['us-east-1a'],
            publicSubnetIds: [cdk.Fn.select(0, publicSubnetIds)],
          };

    // Look up existing VPC
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', vpcAttributes);

    // Import ECS Cluster from SSM Parameter Store
    const clusterName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ECS_CLUSTER_NAME(environment as 'dev' | 'prod')
    );
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
      clusterName: clusterName,
      vpc: vpc,
      securityGroups: [],
    });

    // Import ALB Security Group from SSM Parameter Store
    const albSecurityGroupId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ALB_SECURITY_GROUP_ID(environment as 'dev' | 'prod')
    );
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      albSecurityGroupId
    );

    // Import Target Group from SSM Parameter Store
    const targetGroupArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ALB_TARGET_GROUP_ARN(environment as 'dev' | 'prod')
    );
    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'ImportedTargetGroup',
      {
        targetGroupArn: targetGroupArn,
      }
    );

    // Create Security Group for ECS Tasks
    const ecsTaskSecurityGroup = new ec2.SecurityGroup(
      this,
      'EcsTaskSecurityGroup',
      {
        vpc,
        description: 'Security group for ECS Tasks (nagiyu root domain)',
        allowAllOutbound: true,
      }
    );

    // Allow inbound traffic from ALB on port 3000
    ecsTaskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from ALB'
    );

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'EcsTaskLogGroup', {
      logGroupName: `/ecs/nagiyu-root-task-${environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Task Execution Role
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Execution Role for nagiyu root domain',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    const ecrRepoName = getEcrRepositoryName('tools-app', environment as 'dev' | 'prod');
    const ecrRepositoryArn = `arn:aws:ecr:${this.region}:${this.account}:repository/${ecrRepoName}`;

    // Add ECR permissions to Task Execution Role (scoped to specific repository)
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

    // ECR GetAuthorizationToken requires * resource (AWS requirement)
    taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    // Create Task Role (for application runtime)
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Role for nagiyu root domain',
    });

    const ecrRepositoryUri = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${ecrRepoName}`;

    // Get image tag from environment variable, default to 'latest'
    const imageTag = process.env.IMAGE_TAG || 'latest';

    // Create Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        family: `nagiyu-root-task-${environment}`,
        cpu: 256,
        memoryLimitMiB: 512,
        executionRole: taskExecutionRole,
        taskRole: taskRole,
      }
    );

    // Add container to Task Definition
    const container = this.taskDefinition.addContainer('tools-app', {
      containerName: 'tools-app',
      image: ecs.ContainerImage.fromRegistry(`${ecrRepositoryUri}:${imageTag}`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logGroup: logGroup,
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
      // TODO: Re-enable container health check once curl localhost issue is resolved
      // Container health check is currently disabled because curl commands inside the container
      // are failing despite the application responding correctly to ALB health checks.
      // The ALB target group health check is working properly and monitoring the service.
      // Investigation needed: why localhost/127.0.0.1 requests fail inside the container
      // while external requests via ALB succeed.
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: cluster,
      taskDefinition: this.taskDefinition,
      serviceName: `nagiyu-root-service-${environment}`,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [ecsTaskSecurityGroup],
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(targetGroup);

    // Add tags
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'root-domain');

    // Exports
    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'ECS Service name for root domain',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'ECS Service ARN for root domain',
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'Task Definition ARN for root domain',
    });

    new cdk.CfnOutput(this, 'TaskSecurityGroupId', {
      value: ecsTaskSecurityGroup.securityGroupId,
      description: 'Security Group ID for ECS Tasks',
    });
  }
}
