/**
 * DevSyncStack の最小アサーションテスト
 */

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DevSyncStack } from '../../lib/dev-sync-stack';
import type { ManifestEntry } from '../../lib/manifest';

describe('DevSyncStack', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  describe('Phase A: マニフェスト空配列', () => {
    it('Lambda 関数が 1 つ作成される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: [],
      });

      const template = Template.fromStack(stack);
      // CW Logs Retention 用 Lambda が追加される場合があるため resourceCountIs の代わりに hasResourceProperties を使う
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-dev-sync-dev',
      });
    });

    it('Phase A ではスケジュールが 0 個', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: [],
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Scheduler::Schedule', 0);
    });

    it('IAM ロールが作成される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: [],
      });

      const template = Template.fromStack(stack);
      // Lambda 実行ロールが存在する
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Principal: { Service: 'lambda.amazonaws.com' },
            }),
          ]),
        }),
      });
    });

    it('CfnOutput が存在する', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: [],
      });

      const template = Template.fromStack(stack);
      template.hasOutput('SyncFunctionArn', {});
      template.hasOutput('SyncFunctionName', {});
      template.hasOutput('ManifestEntryCount', {
        Value: '0',
      });
    });
  });

  describe('マニフェストにエントリがある場合', () => {
    const sampleManifest: ManifestEntry[] = [
      {
        sourceTable: 'nagiyu-test-main-prod',
        destTable: 'nagiyu-test-main-dev',
        strategy: 'mirror',
        scope: { pkPrefix: 'USER#' },
        delete: 'on',
        schedule: 'rate(1 day)',
      },
    ];

    it('エントリ数分のスケジュールが作成される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: sampleManifest,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    });

    it('スケジュールに正しいスケジュール式が設定される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: sampleManifest,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        ScheduleExpression: 'rate(1 day)',
        State: 'ENABLED',
      });
    });

    it('スケジューラーロールが作成される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: sampleManifest,
      });

      const template = Template.fromStack(stack);
      // Scheduler 用ロール
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Principal: { Service: 'scheduler.amazonaws.com' },
            }),
          ]),
        }),
      });
    });

    it('ManifestEntryCount が正しく出力される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: sampleManifest,
      });

      const template = Template.fromStack(stack);
      template.hasOutput('ManifestEntryCount', {
        Value: '1',
      });
    });
  });

  describe('gsiWindow 戦略のエントリ', () => {
    it('gsi 設定を持つエントリでスケジュールが作成される', () => {
      const gsiManifest: ManifestEntry[] = [
        {
          sourceTable: 'nagiyu-test-main-prod',
          destTable: 'nagiyu-test-main-dev',
          strategy: 'gsiWindow',
          delete: 'off',
          gsi: {
            indexName: 'GSI1',
            pkAttributeName: 'GSI1PK',
            pkValue: 'ALERT',
            skAttributeName: 'GSI1SK',
            windowDays: 7,
          },
          schedule: 'rate(6 hours)',
        },
      ];

      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: gsiManifest,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Scheduler::Schedule', 1);
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        ScheduleExpression: 'rate(6 hours)',
      });
    });
  });

  describe('複数エントリ・重複テーブル', () => {
    it('同一 source テーブルを持つ複数エントリでもポリシーが重複しない（Set で管理）', () => {
      const multiManifest: ManifestEntry[] = [
        {
          sourceTable: 'nagiyu-test-main-prod',
          destTable: 'nagiyu-test-main-dev',
          strategy: 'mirror',
          delete: 'on',
          schedule: 'rate(1 day)',
        },
        {
          sourceTable: 'nagiyu-test-main-prod', // 同一 source
          destTable: 'nagiyu-other-main-dev',
          strategy: 'mirror',
          delete: 'off',
          schedule: 'rate(12 hours)',
        },
      ];

      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: multiManifest,
      });

      const template = Template.fromStack(stack);
      // 2 つのスケジュールが作成される
      template.resourceCountIs('AWS::Scheduler::Schedule', 2);
    });

    it('scope なしのエントリ（scope=undefined）でも正常に動作する', () => {
      const noScopeManifest: ManifestEntry[] = [
        {
          sourceTable: 'nagiyu-test-main-prod',
          destTable: 'nagiyu-test-main-dev',
          strategy: 'mirror',
          // scope なし
          delete: 'off',
          schedule: 'rate(1 day)',
        },
      ];

      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-dev',
        manifest: noScopeManifest,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    });
  });

  describe('prod 環境', () => {
    it('prod 環境でも Lambda 関数が作成される', () => {
      const stack = new DevSyncStack(app, 'TestStack', {
        environment: 'prod',
        ecrRepositoryName: 'nagiyu-dev-sync-ecr-prod',
        manifest: [],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-dev-sync-prod',
      });
    });
  });
});
