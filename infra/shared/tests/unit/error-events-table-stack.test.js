const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { ErrorEventsTableStack } = require('../../lib/error-events-table-stack');

describe('ErrorEventsTableStack', () => {
  it('環境名を含むテーブル名で DynamoDB テーブルを作成する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'nagiyu-error-events-dev',
    });
  });

  it('PK/SK のキースキーマを設定する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });
  });

  it('GSI AllByOccurredAt を作成する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: [
        {
          IndexName: 'AllByOccurredAt',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });
  });

  it('TTL 属性 ttl を有効化する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true,
      },
    });
  });

  it('Streams を NEW_IMAGE で有効化する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      StreamSpecification: {
        StreamViewType: 'NEW_IMAGE',
      },
    });
  });

  it('PAY_PER_REQUEST モードで作成する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('prod 環境では RemovalPolicy = RETAIN', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'prod',
    });

    const template = Template.fromStack(stack);
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('dev 環境では RemovalPolicy = DESTROY', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('テーブル名・ARN・Stream ARN の Output を生成する', () => {
    const app = new cdk.App();
    const stack = new ErrorEventsTableStack(app, 'TestErrorEventsTable', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasOutput('TableName', {
      Export: { Name: 'nagiyu-error-events-table-name-dev' },
    });
    template.hasOutput('TableArn', {
      Export: { Name: 'nagiyu-error-events-table-arn-dev' },
    });
    template.hasOutput('TableStreamArn', {
      Export: { Name: 'nagiyu-error-events-table-stream-arn-dev' },
    });
  });
});
