import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class CodecConverterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Environment name (default to 'dev')
    const envName = this.node.tryGetContext('env') || 'dev';

    // S3 Bucket for input/output files
    const storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: `nagiyu-codec-converter-storage-${envName}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteOldFiles',
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedOrigins: ['https://codec-converter.nagiyu.com'],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB Table for job management
    const jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `nagiyu-codec-converter-jobs-${envName}`,
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Outputs
    new cdk.CfnOutput(this, 'StorageBucketName', {
      value: storageBucket.bucketName,
      description: 'S3 bucket name for codec converter storage',
      exportName: `CodecConverterStorageBucket-${envName}`,
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: jobsTable.tableName,
      description: 'DynamoDB table name for codec converter jobs',
      exportName: `CodecConverterJobsTable-${envName}`,
    });
  }
}
