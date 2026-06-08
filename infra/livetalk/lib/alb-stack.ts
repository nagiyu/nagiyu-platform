import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Environment, SSM_PARAMETERS } from '@nagiyu/infra-common';

export interface LiveTalkAlbStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk 専用 ALB スタック
 *
 * - 命名規則: `nagiyu-livetalk-alb-{env}`
 * - HTTP リスナー（port 80）→ Target Group へフォワード
 *   HTTPS は Phase 1d 以降で CloudFront 側で終端する方針（既存 Portal と同パターン）
 * - アイドルタイムアウト 120 秒（将来の LLM ストリーミング向け）
 * - Health Check: `/api/health`
 * - Component: livetalk タグを付与
 *
 * 月額固定費（NLB と異なり ALB は最低 ~$22/月 が発生する）に留意。
 */
export class LiveTalkAlbStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly listener: elbv2.ApplicationListener;
  public readonly albSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: LiveTalkAlbStackProps) {
    super(scope, id, props);

    const { environment } = props;

    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(environment)
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment)
    );

    // ALB は最低 2 つの AZ の Subnet が必要。
    // Phase 0 で dev / prod ともに us-east-1a + us-east-1b が整備済み。
    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      publicSubnetIds: [
        cdk.Fn.select(0, publicSubnetIds),
        cdk.Fn.select(1, publicSubnetIds),
      ],
    });

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      securityGroupName: `nagiyu-livetalk-alb-sg-${environment}`,
      description: 'Security group for LiveTalk ALB',
      allowAllOutbound: true,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP from anywhere'
    );

    // Phase 1d で CloudFront → ALB を HTTPS 化する想定で 443 も開けておく。
    // 現時点では HTTPS リスナーは未設定（CloudFront の REDIRECT_TO_HTTPS で終端する想定）。
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from anywhere (reserved for Phase 1d CloudFront integration)'
    );

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LiveTalkAlb', {
      vpc,
      internetFacing: true,
      loadBalancerName: `nagiyu-livetalk-alb-${environment}`,
      securityGroup: this.albSecurityGroup,
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
      idleTimeout: cdk.Duration.seconds(120),
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'LiveTalkTargetGroup', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targetGroupName: `nagiyu-livetalk-tg-${environment}`,
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        protocol: elbv2.Protocol.HTTP,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    this.listener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'LiveTalk ALB DNS name',
    });

    new cdk.CfnOutput(this, 'AlbArn', {
      value: this.loadBalancer.loadBalancerArn,
      description: 'LiveTalk ALB ARN',
    });

    new cdk.CfnOutput(this, 'AlbListenerArn', {
      value: this.listener.listenerArn,
      description: 'LiveTalk ALB Listener ARN',
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      description: 'LiveTalk Target Group ARN',
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      description: 'LiveTalk ALB Security Group ID',
    });

    new ssm.StringParameter(this, 'AlbDnsNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ALB_DNS_NAME(environment),
      stringValue: this.loadBalancer.loadBalancerDnsName,
      description: 'LiveTalk ALB DNS name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AlbArnParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ALB_ARN(environment),
      stringValue: this.loadBalancer.loadBalancerArn,
      description: 'LiveTalk ALB ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AlbListenerArnParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ALB_LISTENER_ARN(environment),
      stringValue: this.listener.listenerArn,
      description: 'LiveTalk ALB Listener ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'TargetGroupArnParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ALB_TARGET_GROUP_ARN(environment),
      stringValue: this.targetGroup.targetGroupArn,
      description: 'LiveTalk Target Group ARN',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AlbSecurityGroupIdParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ALB_SECURITY_GROUP_ID(environment),
      stringValue: this.albSecurityGroup.securityGroupId,
      description: 'LiveTalk ALB Security Group ID',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
