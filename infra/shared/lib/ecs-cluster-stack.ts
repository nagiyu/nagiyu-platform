import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface EcsSharedClusterStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
}

export class EcsSharedClusterStack extends cdk.Stack {
  public readonly clusterName: string;
  public readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: EcsSharedClusterStackProps) {
    super(scope, id, props);

    const { environment } = props;

    const clusterName = `nagiyu-shared-cluster-${environment}`;

    const cfnCluster = new ecs.CfnCluster(this, 'SharedCluster', {
      clusterName,
      // Container Insights は無効化する（Issue #3761）。
      // 出力される `ECS/ContainerInsights` はカスタムメトリクス課金の対象で、
      // 3 クラスタ合計 114 メトリクス・約 $19/月を占めていた。一方でディメンションは
      // ClusterName / ServiceName / TaskDefinitionFamily のみで、コンテナ単位の内訳は
      // 元から取得できていない（それは Enhanced Observability の機能）。
      // サービス単位の CPU / メモリは無料の `AWS/ECS` 名前空間
      // （CPUUtilization / MemoryUtilization）で引き続き取得できる。
      clusterSettings: [
        {
          name: 'containerInsights',
          value: 'disabled',
        },
      ],
    });

    new ecs.CfnClusterCapacityProviderAssociations(
      this,
      'SharedClusterCapacityProviders',
      {
        cluster: cfnCluster.ref,
        capacityProviders: ['FARGATE', 'FARGATE_SPOT'],
        defaultCapacityProviderStrategy: [],
      }
    );

    this.clusterName = clusterName;
    this.clusterArn = cfnCluster.attrArn;

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'shared');

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.clusterName,
      description: 'Shared ECS Cluster name',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.clusterArn,
      description: 'Shared ECS Cluster ARN',
    });

    new ssm.StringParameter(this, 'ClusterNameParam', {
      parameterName: SSM_PARAMETERS.SHARED_ECS_CLUSTER_NAME(environment),
      stringValue: this.clusterName,
      description: 'Shared ECS Cluster name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'ClusterArnParam', {
      parameterName: SSM_PARAMETERS.SHARED_ECS_CLUSTER_ARN(environment),
      stringValue: this.clusterArn,
      description: 'Shared ECS Cluster ARN',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
