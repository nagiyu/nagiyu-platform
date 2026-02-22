import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../common/src/utils/ssm';

export interface AlbStackProps extends cdk.StackProps {
  environment: string;
}

export class AlbStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly listener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Import VPC from SSM Parameter Store
    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(environment as 'dev' | 'prod')
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment as 'dev' | 'prod')
    );

    // For prod, subnet IDs are comma-separated; for dev, it's a single ID
    // We'll use Fn.split to handle both cases
    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);

    // Configure VPC attributes based on environment
    const vpcAttributes =
      environment === 'prod'
        ? {
            vpcId,
            availabilityZones: ['us-east-1a', 'us-east-1b'],
            publicSubnetIds: [
              cdk.Fn.select(0, publicSubnetIds),
              cdk.Fn.select(1, publicSubnetIds),
            ],
          }
        : {
            vpcId,
            availabilityZones: ['us-east-1a'],
            publicSubnetIds: [cdk.Fn.select(0, publicSubnetIds)],
          };

    // Look up existing VPC
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', vpcAttributes);

    // Create Security Group for ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Security group for ALB (nagiyu root domain)',
      allowAllOutbound: true,
    });

    // Allow HTTP from anywhere
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere'
    );

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'RootAlb', {
      vpc,
      internetFacing: true,
      loadBalancerName: `nagiyu-root-alb-${environment}`,
      securityGroup: albSecurityGroup,
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
    });

    // Create Target Group
    this.targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'RootTargetGroup',
      {
        vpc,
        port: 3000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        targetGroupName: `nagiyu-root-tg-${environment}`,
        healthCheck: {
          path: '/api/health',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(5),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 2,
          protocol: elbv2.Protocol.HTTP,
        },
        deregistrationDelay: cdk.Duration.seconds(30),
      }
    );

    // Create Listener
    this.listener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Add tags
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'root-domain');

    // Exports
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      exportName: `nagiyu-root-alb-dns-${environment}`,
      description: 'ALB DNS name for root domain',
    });

    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.loadBalancer.loadBalancerArn,
      exportName: `nagiyu-root-alb-arn-${environment}`,
      description: 'ALB ARN for root domain',
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      exportName: `nagiyu-root-tg-arn-${environment}`,
      description: 'Target Group ARN for root domain',
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: albSecurityGroup.securityGroupId,
      exportName: `nagiyu-root-alb-sg-id-${environment}`,
      description: 'Security Group ID for ALB',
    });
  }
}
