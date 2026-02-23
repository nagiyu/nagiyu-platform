import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface VpcStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
}

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.CfnVPC;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const isProd = props.environment === 'prod';

    // VPC 作成 (L1 Construct で論理 ID を制御)
    this.vpc = new ec2.CfnVPC(this, 'NagiyuVPC', {
      cidrBlock: isProd ? '10.1.0.0/24' : '10.0.0.0/24',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        { key: 'Name', value: `nagiyu-${props.environment}-vpc` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: props.environment },
      ],
    });

    // Internet Gateway
    const internetGateway = new ec2.CfnInternetGateway(
      this,
      'NagiyuInternetGateway',
      {
        tags: [
          { key: 'Name', value: `nagiyu-${props.environment}-igw` },
          { key: 'Application', value: 'nagiyu' },
          { key: 'Environment', value: props.environment },
        ],
      }
    );

    // Attach Internet Gateway to VPC
    const vpcGatewayAttachment = new ec2.CfnVPCGatewayAttachment(
      this,
      'NagiyuVPCGatewayAttachment',
      {
        vpcId: this.vpc.ref,
        internetGatewayId: internetGateway.ref,
      }
    );

    // Public Subnet 1a (both dev and prod)
    const publicSubnet1a = new ec2.CfnSubnet(this, 'NagiyuPublicSubnet1a', {
      vpcId: this.vpc.ref,
      cidrBlock: isProd ? '10.1.0.0/25' : '10.0.0.0/24',
      availabilityZone: `${this.region}a`,
      mapPublicIpOnLaunch: true,
      tags: [
        {
          key: 'Name',
          value: `nagiyu-${props.environment}-public-subnet-1a`,
        },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: props.environment },
        { key: 'Type', value: 'Public' },
      ],
    });

    // Public Subnet 1b (prod only)
    let publicSubnet1b: ec2.CfnSubnet | undefined;
    if (isProd) {
      publicSubnet1b = new ec2.CfnSubnet(this, 'NagiyuPublicSubnet1b', {
        vpcId: this.vpc.ref,
        cidrBlock: '10.1.0.128/25',
        availabilityZone: `${this.region}b`,
        mapPublicIpOnLaunch: true,
        tags: [
          {
            key: 'Name',
            value: `nagiyu-${props.environment}-public-subnet-1b`,
          },
          { key: 'Application', value: 'nagiyu' },
          { key: 'Environment', value: props.environment },
          { key: 'Type', value: 'Public' },
        ],
      });
    }

    // Route Table for Public Subnets
    const publicRouteTable = new ec2.CfnRouteTable(
      this,
      'NagiyuPublicRouteTable',
      {
        vpcId: this.vpc.ref,
        tags: [
          { key: 'Name', value: `nagiyu-${props.environment}-public-rt` },
          { key: 'Application', value: 'nagiyu' },
          { key: 'Environment', value: props.environment },
        ],
      }
    );

    // Default Route to Internet Gateway
    const publicRoute = new ec2.CfnRoute(this, 'NagiyuPublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });
    publicRoute.addDependency(vpcGatewayAttachment);

    // Associate Route Table with Public Subnet 1a
    new ec2.CfnSubnetRouteTableAssociation(
      this,
      'NagiyuPublicSubnet1aRouteTableAssociation',
      {
        subnetId: publicSubnet1a.ref,
        routeTableId: publicRouteTable.ref,
      }
    );

    // Associate Route Table with Public Subnet 1b (prod only)
    if (publicSubnet1b) {
      new ec2.CfnSubnetRouteTableAssociation(
        this,
        'NagiyuPublicSubnet1bRouteTableAssociation',
        {
          subnetId: publicSubnet1b.ref,
          routeTableId: publicRouteTable.ref,
        }
      );
    }

    // Exports（既存の名前を維持）
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.ref,
      description: 'VPC ID',
    });

    const subnetIds = isProd && publicSubnet1b
      ? `${publicSubnet1a.ref},${publicSubnet1b.ref}`
      : publicSubnet1a.ref;
    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: subnetIds,
      description: 'Public subnet IDs (comma-separated)',
    });

    new cdk.CfnOutput(this, 'InternetGatewayId', {
      value: internetGateway.ref,
      description: 'Internet Gateway ID',
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.attrCidrBlock,
      description: 'VPC CIDR block',
    });

    new ssm.StringParameter(this, 'VpcIdParam', {
      parameterName: SSM_PARAMETERS.VPC_ID(props.environment),
      stringValue: this.vpc.ref,
      description: 'VPC ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'PublicSubnetIdsParam', {
      parameterName: SSM_PARAMETERS.PUBLIC_SUBNET_IDS(props.environment),
      stringValue: subnetIds,
      description: 'Public subnet IDs (comma-separated)',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'InternetGatewayIdParam', {
      parameterName: SSM_PARAMETERS.IGW_ID(props.environment),
      stringValue: internetGateway.ref,
      description: 'Internet Gateway ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'VpcCidrParam', {
      parameterName: SSM_PARAMETERS.VPC_CIDR(props.environment),
      stringValue: this.vpc.attrCidrBlock,
      description: 'VPC CIDR block',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
