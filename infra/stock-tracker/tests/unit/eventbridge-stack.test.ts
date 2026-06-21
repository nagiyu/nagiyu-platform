/**
 * EventBridgeStack の単体テスト
 *
 * dev 環境では summary/evaluation の EventBridge Rule が DISABLED になり、
 * prod 環境では ENABLED（State プロパティなし、または ENABLED）になることを検証する。
 * minute/hourly/daily/temporary-alert-expiry は dev でも無効化されないことを確認する。
 */

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { EventBridgeStack } from '../../lib/eventbridge-stack';

/**
 * テスト用のダミー Lambda 関数を作成するヘルパー
 * EventBridgeStack は lambda.IFunction を受け取るだけなので、
 * シンプルなインラインコードの Lambda でスタックを組み立てる
 */
function createTestStack(environment: string): { app: cdk.App; stack: EventBridgeStack } {
  const app = new cdk.App();

  // Lambda 関数を保持する親スタック（EventBridgeStack は別スタックで依存する構成）
  const lambdaHolderStack = new cdk.Stack(app, 'LambdaHolderStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });

  // テスト用ダミー Lambda 関数を 6 つ作成
  const createDummyFunction = (id: string): lambda.Function =>
    new lambda.Function(lambdaHolderStack, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({});'),
    });

  const batchMinuteFunction = createDummyFunction('BatchMinuteFunction');
  const batchHourlyFunction = createDummyFunction('BatchHourlyFunction');
  const batchSummaryFunction = createDummyFunction('BatchSummaryFunction');
  const batchDailyFunction = createDummyFunction('BatchDailyFunction');
  const batchTemporaryAlertExpiryFunction = createDummyFunction('BatchTemporaryAlertExpiryFunction');
  const batchEvaluationFunction = createDummyFunction('BatchEvaluationFunction');

  const stack = new EventBridgeStack(app, 'TestEventBridgeStack', {
    environment,
    batchMinuteFunction,
    batchHourlyFunction,
    batchSummaryFunction,
    batchDailyFunction,
    batchTemporaryAlertExpiryFunction,
    batchEvaluationFunction,
    env: { account: '123456789012', region: 'us-east-1' },
  });

  return { app, stack };
}

describe('EventBridgeStack', () => {
  describe('dev 環境: summary/evaluation の Rule が DISABLED になる', () => {
    let template: Template;

    beforeEach(() => {
      const { stack } = createTestStack('dev');
      template = Template.fromStack(stack);
    });

    it('summary Rule（stock-tracker-batch-summary-dev）が State=DISABLED', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-summary-dev',
        State: 'DISABLED',
      });
    });

    it('evaluation Rule（stock-tracker-batch-evaluation-dev）が State=DISABLED', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-evaluation-dev',
        State: 'DISABLED',
      });
    });

    it('minute Rule は dev でも DISABLED にならない', () => {
      // DISABLED でないことを確認（State=DISABLED の Rule に minute が含まれていない）
      const rules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-minute-dev',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(rules)).toHaveLength(0);
    });

    it('hourly Rule は dev でも DISABLED にならない', () => {
      const rules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-hourly-dev',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(rules)).toHaveLength(0);
    });

    it('daily Rule は dev でも DISABLED にならない', () => {
      const rules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-daily-dev',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(rules)).toHaveLength(0);
    });

    it('temporary-alert-expiry Rule は dev でも DISABLED にならない', () => {
      const rules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-temporary-alert-expiry-dev',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(rules)).toHaveLength(0);
    });

    it('合計 6 つの Rule が作成される', () => {
      template.resourceCountIs('AWS::Events::Rule', 6);
    });
  });

  describe('prod 環境: summary/evaluation の Rule が ENABLED（DISABLED でない）', () => {
    let template: Template;

    beforeEach(() => {
      const { stack } = createTestStack('prod');
      template = Template.fromStack(stack);
    });

    it('summary Rule（stock-tracker-batch-summary-prod）が DISABLED でない', () => {
      // prod では State=DISABLED が存在しないことを確認
      const disabledRules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-summary-prod',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(disabledRules)).toHaveLength(0);
    });

    it('evaluation Rule（stock-tracker-batch-evaluation-prod）が DISABLED でない', () => {
      const disabledRules = template.findResources('AWS::Events::Rule', {
        Properties: {
          Name: 'stock-tracker-batch-evaluation-prod',
          State: 'DISABLED',
        },
      });
      expect(Object.keys(disabledRules)).toHaveLength(0);
    });

    it('prod 環境でも合計 6 つの Rule が作成される', () => {
      template.resourceCountIs('AWS::Events::Rule', 6);
    });
  });

  describe('Lambda ターゲットの結線が維持されている', () => {
    it('dev 環境: summary Rule に Lambda ターゲットが存在する', () => {
      const { stack } = createTestStack('dev');
      const template = Template.fromStack(stack);

      // summary Rule に Targets が存在することを確認
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-summary-dev',
        State: 'DISABLED',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });

    it('dev 環境: evaluation Rule に Lambda ターゲットが存在する', () => {
      const { stack } = createTestStack('dev');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-evaluation-dev',
        State: 'DISABLED',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });

    it('prod 環境: summary Rule に Lambda ターゲットが存在する', () => {
      const { stack } = createTestStack('prod');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-summary-prod',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });

    it('prod 環境: evaluation Rule に Lambda ターゲットが存在する', () => {
      const { stack } = createTestStack('prod');
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'stock-tracker-batch-evaluation-prod',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });
  });

  describe('Rule 名と基本プロパティの検証', () => {
    it('dev 環境: 全 Rule の名前が environment サフィックスを含む', () => {
      const { stack } = createTestStack('dev');
      const template = Template.fromStack(stack);

      const expectedRuleNames = [
        'stock-tracker-batch-minute-dev',
        'stock-tracker-batch-hourly-dev',
        'stock-tracker-batch-summary-dev',
        'stock-tracker-batch-temporary-alert-expiry-dev',
        'stock-tracker-batch-evaluation-dev',
        'stock-tracker-batch-daily-dev',
      ];

      for (const name of expectedRuleNames) {
        template.hasResourceProperties('AWS::Events::Rule', { Name: name });
      }
    });

    it('prod 環境: 全 Rule の名前が environment サフィックスを含む', () => {
      const { stack } = createTestStack('prod');
      const template = Template.fromStack(stack);

      const expectedRuleNames = [
        'stock-tracker-batch-minute-prod',
        'stock-tracker-batch-hourly-prod',
        'stock-tracker-batch-summary-prod',
        'stock-tracker-batch-temporary-alert-expiry-prod',
        'stock-tracker-batch-evaluation-prod',
        'stock-tracker-batch-daily-prod',
      ];

      for (const name of expectedRuleNames) {
        template.hasResourceProperties('AWS::Events::Rule', { Name: name });
      }
    });
  });

  describe('CfnOutput の検証', () => {
    it('dev 環境: 全 ARN Output が存在する', () => {
      const { stack } = createTestStack('dev');
      const template = Template.fromStack(stack);

      template.hasOutput('MinuteRuleArn', {});
      template.hasOutput('HourlyRuleArn', {});
      template.hasOutput('SummaryRuleArn', {});
      template.hasOutput('TemporaryAlertExpiryRuleArn', {});
      template.hasOutput('EvaluationRuleArn', {});
      template.hasOutput('DailyRuleArn', {});
    });
  });
});
