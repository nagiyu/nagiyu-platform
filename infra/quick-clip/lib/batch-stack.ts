import * as cdk from 'aws-cdk-lib';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface BatchStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  storageBucket: s3.IBucket;
  jobsTable: dynamodb.ITable;
}

export class BatchStack extends cdk.Stack {
  public readonly jobQueueArn: string;
  public readonly jobDefinitionPrefix: string;
  public readonly jobDefinitionArns: string[];

  constructor(scope: Construct, id: string, props: BatchStackProps) {
    super(scope, id, props);

    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(props.environment)
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(props.environment)
    );
    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'SharedVpc', {
      vpcId,
      availabilityZones:
        props.environment === 'prod' ? ['us-east-1a', 'us-east-1b'] : ['us-east-1a'],
      publicSubnetIds:
        props.environment === 'prod'
          ? [cdk.Fn.select(0, publicSubnetIds), cdk.Fn.select(1, publicSubnetIds)]
          : [cdk.Fn.select(0, publicSubnetIds)],
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
      computeEnvironmentName: `nagiyu-quick-clip-${props.environment}`,
      type: 'MANAGED',
      state: 'ENABLED',
      computeResources: {
        type: 'FARGATE',
        maxvCpus: 8,
        subnets: publicSubnetIds,
        securityGroupIds: [securityGroup.securityGroupId],
      },
    });

    const jobQueue = new batch.CfnJobQueue(this, 'JobQueue', {
      jobQueueName: `nagiyu-quick-clip-${props.environment}`,
      priority: 1,
      state: 'ENABLED',
      computeEnvironmentOrder: [
        {
          computeEnvironment: computeEnvironment.attrComputeEnvironmentArn,
          order: 1,
        },
      ],
    });

    const batchRepositoryName = `nagiyu-quick-clip-batch-ecr-${props.environment}`;
    const batchImage = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${batchRepositoryName}:batch-latest`;
    const jobDefinitionPrefix = `nagiyu-quick-clip-${props.environment}`;

    const smallJobDefinition = new batch.CfnJobDefinition(this, 'SmallJobDefinition', {
      jobDefinitionName: `${jobDefinitionPrefix}-small`,
      type: 'container',
      platformCapabilities: ['FARGATE'],
      containerProperties: {
        image: batchImage,
        resourceRequirements: [
          { type: 'VCPU', value: '1' },
          { type: 'MEMORY', value: '4096' },
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
        environment: [
          {
            name: 'DYNAMODB_TABLE_NAME',
            value: props.jobsTable.tableName,
          },
          {
            name: 'S3_BUCKET',
            value: props.storageBucket.bucketName,
          },
          {
            name: 'AWS_REGION',
            value: this.region,
          },
        ],
      },
      timeout: { attemptDurationSeconds: 3600 },
      retryStrategy: { attempts: 1 },
    });

    const largeJobDefinition = new batch.CfnJobDefinition(this, 'LargeJobDefinition', {
      jobDefinitionName: `${jobDefinitionPrefix}-large`,
      type: 'container',
      platformCapabilities: ['FARGATE'],
      containerProperties: {
        image: batchImage,
        resourceRequirements: [
          { type: 'VCPU', value: '2' },
          { type: 'MEMORY', value: '8192' },
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
        environment: [
          {
            name: 'DYNAMODB_TABLE_NAME',
            value: props.jobsTable.tableName,
          },
          {
            name: 'S3_BUCKET',
            value: props.storageBucket.bucketName,
          },
          {
            name: 'AWS_REGION',
            value: this.region,
          },
        ],
      },
      timeout: { attemptDurationSeconds: 3 * 3600 },
      retryStrategy: { attempts: 1 },
    });

    this.jobQueueArn = jobQueue.attrJobQueueArn;
    this.jobDefinitionPrefix = jobDefinitionPrefix;
    this.jobDefinitionArns = [
      smallJobDefinition.attrJobDefinitionArn,
      largeJobDefinition.attrJobDefinitionArn,
    ];

    new cdk.CfnOutput(this, 'BatchJobQueueArn', {
      value: this.jobQueueArn,
    });

    new cdk.CfnOutput(this, 'BatchJobDefinitionPrefix', {
      value: this.jobDefinitionPrefix,
    });

    new cdk.CfnOutput(this, 'BatchJobDefinitionArns', {
      value: cdk.Fn.join(',', this.jobDefinitionArns),
    });
  }
}
