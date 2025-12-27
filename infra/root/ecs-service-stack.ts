import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface EcsServiceStackProps extends cdk.StackProps {
  environment: string;
}

export class EcsServiceStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: Construct, id: string, props: EcsServiceStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Import VPC from CloudFormation exports
    const vpcId = cdk.Fn.importValue(`nagiyu-${environment}-vpc-id`);
    const publicSubnetIdsStr = cdk.Fn.importValue(
      `nagiyu-${environment}-public-subnet-ids`
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

    // Import ECS Cluster
    const clusterName = cdk.Fn.importValue(
      `nagiyu-root-cluster-name-${environment}`
    );
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
      clusterName: clusterName,
      vpc: vpc,
      securityGroups: [],
    });

    // Import ALB Security Group
    const albSecurityGroupId = cdk.Fn.importValue(
      `nagiyu-root-alb-sg-id-${environment}`
    );
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      albSecurityGroupId
    );

    // Import Target Group
    const targetGroupArn = cdk.Fn.importValue(
      `nagiyu-root-tg-arn-${environment}`
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

    // Get ECR repository ARN for scoped permissions
    const ecrStackName = `nagiyu-tools-ecr-${environment}`;
    const ecrRepositoryArn = cdk.Fn.importValue(
      `${ecrStackName}-RepositoryArn`
    );

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

    // Get ECR repository URI from CloudFormation export
    // The tools-deploy.yml creates nagiyu-tools-ecr-prod stack
    const ecrRepositoryUri = cdk.Fn.importValue(
      `${ecrStackName}-RepositoryUri`
    );

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
      healthCheck: {
        command: [
          'CMD-SHELL',
          'curl -f http://localhost:3000/api/health || exit 1',
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
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
      exportName: `nagiyu-root-service-name-${environment}`,
      description: 'ECS Service name for root domain',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      exportName: `nagiyu-root-service-arn-${environment}`,
      description: 'ECS Service ARN for root domain',
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      exportName: `nagiyu-root-task-definition-arn-${environment}`,
      description: 'Task Definition ARN for root domain',
    });

    new cdk.CfnOutput(this, 'TaskSecurityGroupId', {
      value: ecsTaskSecurityGroup.securityGroupId,
      exportName: `nagiyu-root-task-sg-id-${environment}`,
      description: 'Security Group ID for ECS Tasks',
    });
  }
}
