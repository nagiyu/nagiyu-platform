/**
 * LambdaStack の単体テスト
 *
 * batch minute / hourly 関数の環境変数に FINNHUB_API_KEY が含まれることを検証する。
 */

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { LambdaStack } from '../../lib/lambda-stack';

/**
 * テスト用 LambdaStack を生成するヘルパー
 */
function createTestStack(finnhubApiKey = 'test-finnhub-api-key'): {
  app: cdk.App;
  stack: LambdaStack;
} {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'ap-northeast-1' };

  // 依存スタック（ダミー）
  const parentStack = new cdk.Stack(app, 'ParentStack', { env });

  const table = new dynamodb.Table(parentStack, 'Table', {
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  });

  const vapidSecret = new secretsmanager.Secret(parentStack, 'VapidSecret');

  const stack = new LambdaStack(app, 'TestLambdaStack', {
    environment: 'dev',
    appVersion: '1.0.0',
    webEcrRepositoryName: 'web-ecr-dev',
    batchEcrRepositoryName: 'batch-ecr-dev',
    dynamoTable: table,
    vapidSecret,
    vapidPublicKey: 'test-vapid-public',
    vapidPrivateKey: 'test-vapid-private',
    openAiApiKey: 'test-openai-key',
    finnhubApiKey,
    nextAuthSecret: 'test-nextauth-secret',
    env,
  });

  return { app, stack };
}

describe('LambdaStack', () => {
  describe('FINNHUB_API_KEY の注入', () => {
    let template: Template;

    beforeEach(() => {
      const { stack } = createTestStack('test-finnhub-key');
      template = Template.fromStack(stack);
    });

    it('BatchMinuteFunction の環境変数に FINNHUB_API_KEY が含まれる', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-minute-dev',
        Environment: {
          Variables: Match.objectLike({
            FINNHUB_API_KEY: 'test-finnhub-key',
          }),
        },
      });
    });

    it('BatchHourlyFunction の環境変数に FINNHUB_API_KEY が含まれる', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-hourly-dev',
        Environment: {
          Variables: Match.objectLike({
            FINNHUB_API_KEY: 'test-finnhub-key',
          }),
        },
      });
    });

    it('BatchSummaryFunction には FINNHUB_API_KEY が含まれない', () => {
      // summary は Finnhub を使わないため注入しない
      const resources = template.findResources('AWS::Lambda::Function', {
        Properties: {
          FunctionName: 'nagiyu-stock-tracker-batch-summary-dev',
          Environment: {
            Variables: Match.objectLike({
              FINNHUB_API_KEY: Match.anyValue(),
            }),
          },
        },
      });
      expect(Object.keys(resources)).toHaveLength(0);
    });

    it('WebFunction には FINNHUB_API_KEY が含まれない', () => {
      // web Lambda は Finnhub を使わないため注入しない
      const resources = template.findResources('AWS::Lambda::Function', {
        Properties: {
          FunctionName: 'nagiyu-stock-tracker-web-dev',
          Environment: {
            Variables: Match.objectLike({
              FINNHUB_API_KEY: Match.anyValue(),
            }),
          },
        },
      });
      expect(Object.keys(resources)).toHaveLength(0);
    });
  });

  describe('FINNHUB_API_KEY の値がコンテキストから反映される', () => {
    it('空文字列を渡した場合でも環境変数に設定される', () => {
      const { stack } = createTestStack('');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-minute-dev',
        Environment: {
          Variables: Match.objectLike({
            FINNHUB_API_KEY: '',
          }),
        },
      });
    });

    it('PLACEHOLDER 値を渡した場合でも環境変数に設定される', () => {
      const { stack } = createTestStack('PLACEHOLDER');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-hourly-dev',
        Environment: {
          Variables: Match.objectLike({
            FINNHUB_API_KEY: 'PLACEHOLDER',
          }),
        },
      });
    });
  });
});
