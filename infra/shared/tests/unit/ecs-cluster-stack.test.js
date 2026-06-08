const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { EcsSharedClusterStack } = require('../../lib/ecs-cluster-stack');

describe('EcsSharedClusterStack', () => {
  it('環境名を含む Cluster 名で ECS Cluster を作成する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'nagiyu-shared-cluster-dev',
    });
  });

  it('Container Insights を有効化する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterSettings: [{ Name: 'containerInsights', Value: 'enabled' }],
    });
  });

  it('FARGATE と FARGATE_SPOT の Capacity Provider を関連付ける', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::ClusterCapacityProviderAssociations', {
      CapacityProviders: ['FARGATE', 'FARGATE_SPOT'],
    });
  });

  it('SSM パラメータに Cluster 名を出力する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/shared/dev/ecs/cluster-name',
      Value: 'nagiyu-shared-cluster-dev',
    });
  });

  it('SSM パラメータに Cluster ARN を出力する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/shared/dev/ecs/cluster-arn',
    });
  });

  it('Component=shared タグを付与する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedCluster', {
      environment: 'dev',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      Tags: [
        { Key: 'Application', Value: 'nagiyu' },
        { Key: 'Component', Value: 'shared' },
        { Key: 'Environment', Value: 'dev' },
        { Key: 'ManagedBy', Value: 'CDK' },
      ],
    });
  });

  it('prod 環境でも正しい Cluster 名を生成する', () => {
    const app = new cdk.App();
    const stack = new EcsSharedClusterStack(app, 'TestEcsSharedClusterProd', {
      environment: 'prod',
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'nagiyu-shared-cluster-prod',
    });
  });
});
