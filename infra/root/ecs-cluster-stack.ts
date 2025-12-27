import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export interface EcsClusterStackProps extends cdk.StackProps {
  environment: string;
}

export class EcsClusterStack extends cdk.Stack {
  public readonly clusterName: string;
  public readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create ECS Cluster (using CfnCluster to avoid automatic VPC creation)
    const cfnCluster = new ecs.CfnCluster(this, 'RootCluster', {
      clusterName: `nagiyu-root-cluster-${environment}`,
      clusterSettings: [
        {
          name: 'containerInsights',
          value: 'enabled',
        },
      ],
      tags: [
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
        { key: 'Component', value: 'root-domain' },
      ],
    });

    // Create capacity provider associations for Fargate
    new ecs.CfnClusterCapacityProviderAssociations(
      this,
      'RootClusterCapacityProviders',
      {
        cluster: cfnCluster.ref,
        capacityProviders: ['FARGATE', 'FARGATE_SPOT'],
        defaultCapacityProviderStrategy: [],
      }
    );

    // Store cluster details
    this.clusterName = cfnCluster.clusterName!;
    this.clusterArn = cfnCluster.attrArn;

    // Add tags
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'root-domain');

    // Export cluster name for other stacks
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.clusterName,
      exportName: `nagiyu-root-cluster-name-${environment}`,
      description: 'ECS Cluster name for root domain',
    });

    // Export cluster ARN for other stacks
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.clusterArn,
      exportName: `nagiyu-root-cluster-arn-${environment}`,
      description: 'ECS Cluster ARN for root domain',
    });
  }
}
