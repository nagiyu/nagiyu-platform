const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { DockerBuildLockStack } = require('../../lib/docker-build-lock-stack');

describe('DockerBuildLockStack', () => {
  it('固定バケット名でロック用S3バケットを作成する', () => {
    const app = new cdk.App();
    const stack = new DockerBuildLockStack(app, 'TestDockerBuildLockStack');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-docker-build-lock',
    });
  });

  it('パブリックアクセスブロックを有効化する', () => {
    const app = new cdk.App();
    const stack = new DockerBuildLockStack(app, 'TestDockerBuildLockStack');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('1日でロックオブジェクトを削除するライフサイクルルールを設定する', () => {
    const app = new cdk.App();
    const stack = new DockerBuildLockStack(app, 'TestDockerBuildLockStack');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          {
            Id: 'DeleteOldLocks',
            Status: 'Enabled',
            ExpirationInDays: 1,
          },
        ],
      },
    });
  });
});
