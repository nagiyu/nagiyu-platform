import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Environment, SSM_PARAMETERS } from '@nagiyu/infra-common';

export interface LiveTalkDynamoDbStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk DynamoDB Single Table スタック
 *
 * - 命名: `nagiyu-livetalk-{env}`（`tasks/livetalk/design.md` 3.2 節に準拠）
 * - PK / SK の 2 キー Single Table 構成。MVP では GSI を作成しない
 *   （`design.md` 3.2 節：「MVP では GSI 不要、Phase 進行で必要になれば追加」）
 * - Message は TTL（属性名 `TTL`、Unix 秒）で 90 日後に自動削除
 * - Point-in-time Recovery 有効、AWS マネージドキーで at-rest 暗号化
 * - dev は破棄、prod は保持
 * - 他スタック（ECS Service など）から参照しやすいよう、テーブル名 / ARN を
 *   SSM パラメータに出力する
 */
export class LiveTalkDynamoDbStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LiveTalkDynamoDbStackProps) {
    super(scope, id, props);

    const { environment } = props;

    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: `nagiyu-livetalk-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'TTL',
      removalPolicy:
        environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new ssm.StringParameter(this, 'TableNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_DYNAMODB_TABLE_NAME(environment),
      stringValue: this.table.tableName,
      description: 'LiveTalk DynamoDB Single Table 名',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'TableArnParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_DYNAMODB_TABLE_ARN(environment),
      stringValue: this.table.tableArn,
      description: 'LiveTalk DynamoDB Single Table ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'LiveTalk DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'LiveTalk DynamoDB Table ARN',
    });
  }
}
