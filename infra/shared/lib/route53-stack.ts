import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface Route53StackProps extends cdk.StackProps {
  domainName: string;
}

export class Route53Stack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
      zoneName: props.domainName,
      comment: `Public hosted zone for ${props.domainName}`,
    });

    new cdk.CfnOutput(this, 'HostedZoneIdExport', {
      value: this.hostedZone.hostedZoneId,
      description: 'ID of the Route53 hosted zone',
    });

    new cdk.CfnOutput(this, 'HostedZoneNameExport', {
      value: this.hostedZone.zoneName,
      description: 'Name of the Route53 hosted zone',
    });

    // Phase 4 の NS 切替で XServer 側に登録する NS 値を取得するため
    new cdk.CfnOutput(this, 'HostedZoneNameServersExport', {
      value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers ?? []),
      description: 'Name servers assigned to the hosted zone (used for NS switchover in Phase 4)',
    });

    new ssm.StringParameter(this, 'HostedZoneIdParam', {
      parameterName: SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID,
      stringValue: this.hostedZone.hostedZoneId,
      description: 'ID of the Route53 hosted zone',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'HostedZoneNameParam', {
      parameterName: SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_NAME,
      stringValue: this.hostedZone.zoneName,
      description: 'Name of the Route53 hosted zone',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
