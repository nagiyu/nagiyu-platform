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
      clusterSettings: [
        {
          name: 'containerInsights',
          value: 'enabled',
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
