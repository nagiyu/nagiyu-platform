const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkDynamoDbStack } = require('../../lib/dynamodb-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkDynamoDbStack(app, `TestLiveTalkDynamoDB${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkDynamoDbStack', () => {
  it('テーブル名はヘルパー命名規則 `nagiyu-livetalk-dynamodb-{env}` に従う', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'nagiyu-livetalk-dynamodb-dev',
    });
  });

  it('PK / SK の 2 キー Single Table 構成に GSI1（Profile 列挙用 sparse GSI）と GSI2（SafetyEvent 横断レビュー用 sparse GSI）と GSI3（GSI-TOPIC）と GSI4（GSI-STALE）を追加する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
        { AttributeName: 'GSI3PK', AttributeType: 'S' },
        { AttributeName: 'GSI3SK', AttributeType: 'N' },
        { AttributeName: 'GSI4PK', AttributeType: 'S' },
        { AttributeName: 'GSI4SK', AttributeType: 'N' },
      ]),
    });
    // GSI1: Profile 列挙用 sparse GSI（#3527）
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' },
        },
      ]),
    });
  });

  it('GSI2（SafetyEvent 横断レビュー用 sparse GSI）が INCLUDE 射影でメタデータ属性を含む', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'GSI2',
          KeySchema: [
            { AttributeName: 'GSI2PK', KeyType: 'HASH' },
            { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: Match.arrayWith([
              'UserID',
              'EventID',
              'CharacterID',
              'Trigger',
              'DetectedPattern',
              'CreatedAt',
            ]),
          },
        },
      ]),
    });
  });

  it('PAY_PER_REQUEST + PITR + TTL 属性 + AWS_MANAGED 暗号化を設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      TimeToLiveSpecification: { AttributeName: 'TTL', Enabled: true },
      SSESpecification: Match.objectLike({ SSEEnabled: true }),
    });
  });

  it('dev 環境は DESTROY ポリシー', () => {
    const template = synth('dev');
    const tableResource = template.findResources('AWS::DynamoDB::Table');
    const table = Object.values(tableResource)[0];
    expect(table.DeletionPolicy).toBe('Delete');
    expect(table.UpdateReplacePolicy).toBe('Delete');
  });

  it('prod 環境は RETAIN ポリシーで命名も prod を反映する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'nagiyu-livetalk-dynamodb-prod',
    });
    const tableResource = template.findResources('AWS::DynamoDB::Table');
    const table = Object.values(tableResource)[0];
    expect(table.DeletionPolicy).toBe('Retain');
    expect(table.UpdateReplacePolicy).toBe('Retain');
  });

  it('GSI3（GSI-TOPIC: Topic ヘッダ(META) 列挙・care 降順取得用 sparse GSI）が INCLUDE 射影で属性を含む（#3697）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'GSI3',
          KeySchema: [
            { AttributeName: 'GSI3PK', KeyType: 'HASH' },
            { AttributeName: 'GSI3SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: Match.arrayWith([
              'UserID',
              'CharacterID',
              'TopicID',
              'Subject',
              'CanonicalSummary',
              'Category',
              'Embedding',
              'CreatedAt',
              'UpdatedAt',
            ]),
          },
        },
      ]),
    });
  });

  it('GSI4（GSI-STALE: 揮発 WEB fact の鮮度掃引用 sparse GSI）が INCLUDE 射影で属性を含む（#3699）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'GSI4',
          KeySchema: [
            { AttributeName: 'GSI4PK', KeyType: 'HASH' },
            { AttributeName: 'GSI4SK', KeyType: 'RANGE' },
          ],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: Match.arrayWith([
              'UserID',
              'CharacterID',
              'TopicID',
              'FactID',
              'Text',
              'SourceUrls',
              'Volatility',
              'ObservedAt',
            ]),
          },
        },
      ]),
    });
  });

  it('SSM パラメータは発行しない（サービス固有名を infra/common に増やさない方針）', () => {
    const template = synth('dev');
    const ssm = template.findResources('AWS::SSM::Parameter');
    expect(Object.keys(ssm)).toHaveLength(0);
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });
});
