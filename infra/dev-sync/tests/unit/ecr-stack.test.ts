/**
 * DevSyncEcrStack の最小アサーションテスト
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DevSyncEcrStack } from '../../lib/ecr-stack';

describe('DevSyncEcrStack', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  it('dev 環境で ECR リポジトリが作成される', () => {
    const stack = new DevSyncEcrStack(app, 'TestStack', { environment: 'dev' });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::ECR::Repository', 1);
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'nagiyu-dev-sync-ecr-dev',
    });
  });

  it('prod 環境で ECR リポジトリが作成される', () => {
    const stack = new DevSyncEcrStack(app, 'TestStack', { environment: 'prod' });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'nagiyu-dev-sync-ecr-prod',
    });
  });

  it('dev 環境では DESTROY リムーバルポリシーが設定される', () => {
    const stack = new DevSyncEcrStack(app, 'TestStack', { environment: 'dev' });
    const template = Template.fromStack(stack);

    template.hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Delete',
    });
  });

  it('prod 環境では RETAIN リムーバルポリシーが設定される', () => {
    const stack = new DevSyncEcrStack(app, 'TestStack', { environment: 'prod' });
    const template = Template.fromStack(stack);

    template.hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Retain',
    });
  });
});
