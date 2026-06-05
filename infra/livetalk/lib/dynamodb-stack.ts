import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Environment, getDynamoDBTableName } from '@nagiyu/infra-common';

export interface LiveTalkDynamoDbStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk DynamoDB Single Table スタック
 *
 * - 命名: 共通ヘルパー `getDynamoDBTableName('livetalk', env)` で決定
 * - PK / SK の 2 キー Single Table 構成。MVP では GSI を作成しない
 *   （`docs/services/livetalk/architecture.md` §3「データモデル概要」。MVP では GSI 不要、Phase 進行で必要になれば追加）
 * - Message は TTL（属性名 `TTL`、Unix 秒）で 90 日後に自動削除
 * - Point-in-time Recovery 有効、AWS マネージドキーで at-rest 暗号化
 * - dev は破棄、prod は保持
 * - 他スタック（ECS Service など）からは `getDynamoDBTableName('livetalk', env)` /
 *   `getDynamoDBTableArn(...)` を使って同じ値を独立に組み立てる。
 *   CDK のクロススタック参照（`Fn::ImportValue`）を避けることで、CloudFormation
 *   の export 依存に伴うカスケード再デプロイを発生させない。SSM 経由でも同じ
 *   結合が生じるため、サービス固有のキーを `infra/common` に追加しない。
 * - `public readonly table` はテストや CfnOutput 用に保持するが、他スタックへの
 *   prop パススルー目的では使わない。
 */
export class LiveTalkDynamoDbStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LiveTalkDynamoDbStackProps) {
    super(scope, id, props);

    const { environment } = props;

    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: getDynamoDBTableName('livetalk', environment),
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
