import * as cdk from 'aws-cdk-lib';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BatchStackProps extends cdk.StackProps {
  environment: string;
  storageBucket: s3.IBucket;
  jobsTable: dynamodb.ITable;
}

export class BatchStack extends cdk.Stack {
  public readonly jobQueueArn: string;
  public readonly jobDefinitionArn: string;

  constructor(scope: Construct, id: string, props: BatchStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'BatchVpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, 'BatchSecurityGroup', {
      vpc,
      description: 'QuickClip Batch security group',
      allowAllOutbound: true,
    });

    const executionRole = new iam.Role(this, 'BatchExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    const jobRole = new iam.Role(this, 'BatchJobRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    props.storageBucket.grantReadWrite(jobRole);
    props.jobsTable.grantReadWriteData(jobRole);

    const batchLogGroup = new logs.LogGroup(this, 'BatchLogGroup', {
      logGroupName: `/aws/batch/nagiyu-quick-clip-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const computeEnvironment = new batch.CfnComputeEnvironment(this, 'ComputeEnvironment', {
      type: 'MANAGED',
      state: 'ENABLED',
      computeResources: {
        type: 'FARGATE',
        maxvCpus: 4,
        subnets: vpc.publicSubnets.map((subnet) => subnet.subnetId),
        securityGroupIds: [securityGroup.securityGroupId],
      },
    });

    const jobQueue = new batch.CfnJobQueue(this, 'JobQueue', {
      priority: 1,
      state: 'ENABLED',
      computeEnvironmentOrder: [
        {
          computeEnvironment: computeEnvironment.attrComputeEnvironmentArn,
          order: 1,
        },
      ],
    });

    const jobDefinition = new batch.CfnJobDefinition(this, 'JobDefinition', {
      type: 'container',
      platformCapabilities: ['FARGATE'],
      containerProperties: {
        image: 'public.ecr.aws/docker/library/busybox:latest',
        command: ['sh', '-c', 'echo quick-clip batch bootstrap'],
        resourceRequirements: [
          { type: 'VCPU', value: '1' },
          { type: 'MEMORY', value: '2048' },
        ],
        executionRoleArn: executionRole.roleArn,
        jobRoleArn: jobRole.roleArn,
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
      },
      timeout: { attemptDurationSeconds: 3600 },
      retryStrategy: { attempts: 1 },
    });

    this.jobQueueArn = jobQueue.attrJobQueueArn;
    this.jobDefinitionArn = jobDefinition.attrJobDefinitionArn;

    new cdk.CfnOutput(this, 'BatchJobQueueArn', {
      value: this.jobQueueArn,
    });

    new cdk.CfnOutput(this, 'BatchJobDefinitionArn', {
      value: this.jobDefinitionArn,
    });
  }
}
