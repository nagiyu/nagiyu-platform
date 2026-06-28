/**
 * SecretsStack の単体テスト
 *
 * Finnhub API キーシークレットが正しく作成されることを検証する。
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { SecretsStack } from '../../lib/secrets-stack';

/**
 * テスト用 SecretsStack を生成するヘルパー
 */
function createTestStack(environment: string): { app: cdk.App; stack: SecretsStack } {
  const app = new cdk.App();
  const stack = new SecretsStack(app, 'TestSecretsStack', {
    environment,
    env: { account: '123456789012', region: 'ap-northeast-1' },
  });
  return { app, stack };
}

describe('SecretsStack', () => {
  describe('Finnhub API キーシークレットの作成', () => {
    describe('dev 環境', () => {
      let template: Template;

      beforeEach(() => {
        const { stack } = createTestStack('dev');
        template = Template.fromStack(stack);
      });

      it('Finnhub API キーシークレットが作成される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-finnhub-api-key-dev',
        });
      });

      it('Finnhub シークレットに正しいタグが付与される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-finnhub-api-key-dev',
          Tags: [
            { Key: 'Application', Value: 'nagiyu' },
            { Key: 'Environment', Value: 'dev' },
            { Key: 'Service', Value: 'stock-tracker' },
          ],
        });
      });

      it('FinnhubApiKeySecretArn の CfnOutput が存在する', () => {
        template.hasOutput('FinnhubApiKeySecretArn', {});
      });

      it('FinnhubApiKeySecretName の CfnOutput が存在する', () => {
        template.hasOutput('FinnhubApiKeySecretName', {});
      });

      it('OpenAI シークレットも引き続き作成される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-openai-api-key-dev',
        });
      });

      it('VAPID シークレットも引き続き作成される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-vapid-dev',
        });
      });
    });

    describe('prod 環境', () => {
      let template: Template;

      beforeEach(() => {
        const { stack } = createTestStack('prod');
        template = Template.fromStack(stack);
      });

      it('Finnhub API キーシークレットが prod 環境で作成される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-finnhub-api-key-prod',
        });
      });

      it('Finnhub シークレットに prod タグが付与される', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
          Name: 'nagiyu-stock-tracker-finnhub-api-key-prod',
          Tags: [
            { Key: 'Application', Value: 'nagiyu' },
            { Key: 'Environment', Value: 'prod' },
            { Key: 'Service', Value: 'stock-tracker' },
          ],
        });
      });
    });
  });

  describe('既存シークレットが引き続き作成される', () => {
    it('dev 環境: VAPID / OpenAI / Finnhub の 3 シークレットに dev 認証情報シークレットを加えた合計 4 シークレットが作成される', () => {
      const { stack } = createTestStack('dev');
      const template = Template.fromStack(stack);
      // dev: VAPID + OpenAI + Finnhub + DevCredentials = 4
      template.resourceCountIs('AWS::SecretsManager::Secret', 4);
    });

    it('prod 環境: VAPID / OpenAI / Finnhub の合計 3 シークレットが作成される', () => {
      const { stack } = createTestStack('prod');
      const template = Template.fromStack(stack);
      // prod: VAPID + OpenAI + Finnhub = 3
      template.resourceCountIs('AWS::SecretsManager::Secret', 3);
    });
  });
});
