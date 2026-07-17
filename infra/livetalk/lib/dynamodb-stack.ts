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
 * - PK / SK の 2 キー Single Table 構成。Profile 列挙のために GSI1 を追加した（#3527）。
 *   GSI1PK='PROFILE' の sparse GSI で Profile のみ索引化する。
 *   SafetyEvent 横断レビューのために GSI2 を追加した（ADR-2.22 / #3580）。
 *   GSI2PK='SAFETY' の sparse GSI で SafetyEvent のみ索引化し、メタデータを INCLUDE 射影する。
 *   Topic 中心モデル（リブトーク知識再設計 P1 / #3697、shadow build）のために GSI3 を追加した。
 *   GSI-TOPIC: Topic ヘッダ(META) のみを sparse 索引化する。想起の座標列挙と acquire の
 *   care 降順取得を賄う（#3697）。
 *   acquire バッチの鮮度掃引（リブトーク知識再設計 P3 / #3699）のために GSI4 を追加した。
 *   GSI-STALE: 揮発性のある WEB fact（NextReview を持つもの）のみを sparse 索引化し、
 *   `nextReview<=now` の窓走査で鮮度切れ fact を列挙する。
 *   （`docs/services/livetalk/architecture.md` §3「データモデル概要」参照）
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
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI1: Profile のみを sparse 索引化するための GSI（#3527）
    // GSI1PK='PROFILE' の Profile アイテムのみが対象（sparse GSI）
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // GSI2: SafetyEvent のみを sparse 索引化する横断レビュー用 GSI（ADR-2.22 / #3580）
    // GSI2PK='SAFETY' の SafetyEvent アイテムのみが対象（sparse GSI）
    // 射影は一覧表示に必要なメタデータのみ INCLUDE（InputText/ResponseText は PII のため除外）
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'UserID',
        'EventID',
        'CharacterID',
        'Trigger',
        'DetectedPattern',
        'CreatedAt',
      ],
    });

    // GSI3（GSI-TOPIC）: Topic ヘッダ(META) のみを sparse 索引化する。
    // 想起の座標列挙と acquire の care 降順を賄う（リブトーク知識再設計 P1 / #3697）。
    // GSI3PK=`<characterId>#TOPICS#<userId>` の META アイテムのみが対象（sparse GSI）
    // GSI3SK は Care（Number 型。care 降順 Query と全件列挙の両方を賄う）
    // 射影は Topic ヘッダ列挙・care 降順取得に必要な属性のみを INCLUDE する
    // （Care は GSI3SK と重複するため除外）。
    // 依頼フック（RequestText/RequestedAt、甲-1: 依頼由来 provenance）は意図的に含めない。
    // 依頼フックは generate-note が getTopicBundle（ベーステーブル読み）でのみ参照し、
    // Topic ヘッダ列挙・care 降順取得（GSI3 経由）では使わないため、GSI3 だけで
    // TopicEntity を完全復元できるとは限らない（この 2 属性を除いた不変条件になった）。
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'UserID',
        'CharacterID',
        'TopicID',
        'Subject',
        'CanonicalSummary',
        'Category',
        'Embedding',
        'CreatedAt',
        'UpdatedAt',
      ],
    });

    // GSI4（GSI-STALE）: 揮発性のある WEB fact（NextReview を持つもの）のみを sparse 索引化する。
    // acquire バッチの鮮度掃引（`nextReview<=now` の窓走査）を賄う（リブトーク知識再設計 P3 / #3699）。
    // GSI4PK=`<characterId>#STALE#<userId>` の対象アイテムのみが対象（sparse GSI。stable fact は
    // NextReview を持たないため GSI4PK/GSI4SK を付与せず、この GSI に一切現れない）
    // GSI4SK は NextReview（Number 型）
    // 射影は WebFactMapper.toEntity が GSI4 の Query 結果だけで WebFactEntity を復元できるよう、
    // NextReview（GSI4SK と重複するため除外）以外の必須属性を INCLUDE する。
    // CreatedAt は toEntity の必須フィールドのため必ず射影する（欠落すると鮮度掃引の復元で失敗する）。
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'UserID',
        'CharacterID',
        'TopicID',
        'FactID',
        'Text',
        'SourceUrls',
        'Volatility',
        'ObservedAt',
        'CreatedAt',
      ],
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
