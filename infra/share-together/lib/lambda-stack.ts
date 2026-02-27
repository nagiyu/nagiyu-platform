import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';
import { WebRuntimePolicy } from './policies/web-runtime-policy';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  appVersion: string;
  dynamoTable: dynamodb.ITable;
}

export class LambdaStack extends LambdaStackBase {
  public readonly webRuntimePolicy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, appVersion, dynamoTable, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'share-together',
      environment: environment as 'dev' | 'prod',
      lambdaConfig: {
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          APP_VERSION: appVersion,
          DYNAMODB_TABLE_NAME: dynamoTable.tableName,
          AUTH_URL: environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
          NEXT_PUBLIC_AUTH_URL:
            environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
          APP_URL:
            environment === 'prod'
              ? 'https://share-together.nagiyu.com'
              : 'https://dev-share-together.nagiyu.com',
        },
      },
      enableFunctionUrl: true,
    };

    super(scope, id, baseProps);

    this.webRuntimePolicy = new WebRuntimePolicy(this, 'WebRuntimePolicy', {
      dynamoTable,
      envName: environment,
    });

    this.executionRole.addManagedPolicy(this.webRuntimePolicy);

    new cdk.CfnOutput(this, 'WebRuntimePolicyArn', {
      value: this.webRuntimePolicy.managedPolicyArn,
      description: 'Web Runtime Managed Policy ARN',
    });
  }
}
