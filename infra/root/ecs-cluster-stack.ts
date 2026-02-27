import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../common/src/utils/ssm';

export interface EcsClusterStackProps extends cdk.StackProps {
  environment: string;
}

export class EcsClusterStack extends cdk.Stack {
  public readonly clusterName: string;
  public readonly clusterArn: string;

  constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const ssmEnvironment = environment as 'dev' | 'prod';

    // Define cluster name as a constant for consistency
    const clusterName = `nagiyu-root-cluster-${environment}`;

    // Create ECS Cluster (using CfnCluster to avoid automatic VPC creation)
    const cfnCluster = new ecs.CfnCluster(this, 'RootCluster', {
      clusterName: clusterName,
      clusterSettings: [
        {
          name: 'containerInsights',
          value: 'enabled',
        },
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

    // Store cluster details (use explicit values to avoid undefined issues)
    this.clusterName = clusterName;
    this.clusterArn = cfnCluster.attrArn;

    // Add tags
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'root-domain');

    // Export cluster name for other stacks
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.clusterName,
      description: 'ECS Cluster name for root domain',
    });

    // Export cluster ARN for other stacks
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.clusterArn,
      description: 'ECS Cluster ARN for root domain',
    });

    new ssm.StringParameter(this, 'ClusterNameParam', {
      parameterName: SSM_PARAMETERS.ECS_CLUSTER_NAME(ssmEnvironment),
      stringValue: this.clusterName,
      description: 'ECS Cluster name for root domain',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'ClusterArnParam', {
      parameterName: SSM_PARAMETERS.ECS_CLUSTER_ARN(ssmEnvironment),
      stringValue: this.clusterArn,
      description: 'ECS Cluster ARN for root domain',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
