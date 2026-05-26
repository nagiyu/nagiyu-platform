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
  it('テーブル名は環境名込みで `nagiyu-livetalk-{env}` になる', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'nagiyu-livetalk-dev',
    });
  });

  it('PK / SK の 2 キー Single Table 構成（GSI なし）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ]),
    });
    // MVP では GSI を作成しない
    const tableResource = template.findResources('AWS::DynamoDB::Table');
    const table = Object.values(tableResource)[0];
    expect(table.Properties.GlobalSecondaryIndexes).toBeUndefined();
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

  it('prod 環境は RETAIN ポリシー', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'nagiyu-livetalk-prod',
    });
    const tableResource = template.findResources('AWS::DynamoDB::Table');
    const table = Object.values(tableResource)[0];
    expect(table.DeletionPolicy).toBe('Retain');
    expect(table.UpdateReplacePolicy).toBe('Retain');
  });

  it('SSM Parameter にテーブル名と ARN を出力する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/dynamodb/table-name',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/dynamodb/table-arn',
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('prod 環境の SSM パラメータ名にも prod が反映される', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/dynamodb/table-name',
    });
  });
});
