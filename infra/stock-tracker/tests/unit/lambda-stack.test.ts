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
function createTestStack(
  finnhubApiKey = 'test-finnhub-api-key',
  forecastLegacyExclusionBefore?: string
): {
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
    forecastLegacyExclusionBefore,
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

  describe('BatchForecastFunction', () => {
    let template: Template;

    beforeEach(() => {
      const { stack } = createTestStack();
      template = Template.fromStack(stack);
    });

    it('forecast.handler をハンドラーとして 15 分タイムアウト・同時実行数1で作成される', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-forecast-dev',
        Timeout: 900, // 15分（秒）。リプレイ（初期値算出）が Lambda の上限に収まる想定
        ReservedConcurrentExecutions: 1,
        Environment: {
          Variables: Match.objectLike({
            BATCH_TYPE: 'FORECAST',
          }),
        },
      });
    });

    it('forecastLegacyExclusionBefore 未指定時は STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE を含まない', () => {
      const resources = template.findResources('AWS::Lambda::Function', {
        Properties: {
          FunctionName: 'nagiyu-stock-tracker-batch-forecast-dev',
          Environment: {
            Variables: Match.objectLike({
              STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE: Match.anyValue(),
            }),
          },
        },
      });
      expect(Object.keys(resources)).toHaveLength(0);
    });

    it('forecastLegacyExclusionBefore 指定時は STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE に反映される', () => {
      const { stack } = createTestStack('test-finnhub-api-key', '2026-03-15');
      const templateWithBoundary = Template.fromStack(stack);

      templateWithBoundary.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-forecast-dev',
        Environment: {
          Variables: Match.objectLike({
            STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE: '2026-03-15',
          }),
        },
      });
    });

    it('BatchSummaryFunction の環境変数に STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME が含まれる', () => {
      // 毎時の起動を待たずに、summary バッチが完了時に forecast を非同期起動するため
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-stock-tracker-batch-summary-dev',
        Environment: {
          Variables: Match.objectLike({
            STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME: 'nagiyu-stock-tracker-batch-forecast-dev',
          }),
        },
      });
    });

    it('BatchRuntimePolicy に forecast 関数への lambda:InvokeFunction が含まれる', () => {
      // batchExecutionRole は全 batch 関数で共有されるため、この付与で summary からの
      // 非同期起動が可能になる
      template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'InvokeForecastBatchFunction',
              Action: 'lambda:InvokeFunction',
              Effect: 'Allow',
              Resource: Match.objectLike({
                'Fn::Join': Match.arrayWith([
                  Match.arrayWith([Match.stringLikeRegexp('nagiyu-stock-tracker-batch-forecast-dev$')]),
                ]),
              }),
            }),
          ]),
        }),
      });
    });
  });
});
