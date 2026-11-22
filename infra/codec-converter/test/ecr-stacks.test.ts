import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BatchECRStack, WebECRStack } from '../lib/ecr-stacks';

const stackEnv = { account: '123456789012', region: 'us-east-1' };

describe('WebECRStack', () => {
  test.each(['dev', 'prod'])(
    '%s 環境で Web 用リポジトリが命名規約の名前で作られる',
    (environment) => {
      const app = new cdk.App();
      const stack = new WebECRStack(app, 'TestWebEcr', { environment, env: stackEnv });
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::ECR::Repository', 1);
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: `nagiyu-codec-converter-ecr-${environment}`,
        ImageScanningConfiguration: { ScanOnPush: true },
      });
      template.hasOutput('RepositoryUri', {});
    }
  );
});

describe('BatchECRStack', () => {
  test.each(['dev', 'prod'])(
    '%s 環境で Batch 用リポジトリが Web 用と別の名前で作られる',
    (environment) => {
      const app = new cdk.App();
      const stack = new BatchECRStack(app, 'TestBatchEcr', { environment, env: stackEnv });
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::ECR::Repository', 1);
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: `nagiyu-codec-converter-batch-ecr-${environment}`,
      });
      template.hasOutput('RepositoryUri', {});
    }
  );
});
