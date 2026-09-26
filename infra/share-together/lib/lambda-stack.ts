import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import {
  grantErrorEventsWrite,
  LambdaStackBase,
  LambdaStackBaseProps,
  getServiceUrl,
} from '@nagiyu/infra-common';
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
    const nextAuthSecret = scope.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER';

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'share-together',
      environment: environment as 'dev' | 'prod',
      lambdaConfig: {
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          // NAGIYU_ENV: NextAuth の Cookie ドメイン判定用。NODE_ENV は Next.js のビルド時に
          // 'production' へ静的置換されるため、デプロイ後の dev/prod 判定には使えない
          // （libs/nextjs/src/auth-config.ts 参照）。
          NAGIYU_ENV: environment,
          APP_VERSION: appVersion,
          DYNAMODB_TABLE_NAME: dynamoTable.tableName,
          AUTH_URL: getServiceUrl('auth', environment as 'dev' | 'prod'),
          NEXT_PUBLIC_AUTH_URL: getServiceUrl('auth', environment as 'dev' | 'prod'),
          APP_URL: getServiceUrl('share-together', environment as 'dev' | 'prod'),
          AUTH_SECRET: nextAuthSecret,
          ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${environment}`,
        },
      },
      enableFunctionUrl: true,
    };

    super(scope, id, baseProps);

    grantErrorEventsWrite(this, this.executionRole, environment as 'dev' | 'prod');

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
