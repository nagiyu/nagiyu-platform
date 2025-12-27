import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * VPC Stack for nagiyu-platform root domain infrastructure
 * 
 * Creates a VPC with:
 * - VPC CIDR: 10.0.0.0/16
 * - 2 Public subnets (10.0.0.0/24, 10.0.1.0/24) in us-east-1a, us-east-1b
 * - 2 Private subnets (10.0.100.0/24, 10.0.101.0/24) for future use
 * - Internet Gateway
 * - No NAT Gateway (cost optimization)
 */
export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create VPC
    const vpc = new ec2.CfnVPC(this, 'NagiyuVpc', {
      cidrBlock: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-vpc` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Create Internet Gateway
    const igw = new ec2.CfnInternetGateway(this, 'NagiyuIGW', {
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-igw` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Attach Internet Gateway to VPC
    new ec2.CfnVPCGatewayAttachment(this, 'NagiyuVPCGatewayAttachment', {
      vpcId: vpc.ref,
      internetGatewayId: igw.ref,
    });

    // Create Public Subnets
    const publicSubnet1 = new ec2.CfnSubnet(this, 'PublicSubnet1', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.0.0/24',
      availabilityZone: 'us-east-1a',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-public-subnet-1a` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'Type', value: 'Public' },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    const publicSubnet2 = new ec2.CfnSubnet(this, 'PublicSubnet2', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.1.0/24',
      availabilityZone: 'us-east-1b',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-public-subnet-1b` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'Type', value: 'Public' },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Create Private Subnets (for future use)
    const privateSubnet1 = new ec2.CfnSubnet(this, 'PrivateSubnet1', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.100.0/24',
      availabilityZone: 'us-east-1a',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-private-subnet-1a` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'Type', value: 'Private' },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    const privateSubnet2 = new ec2.CfnSubnet(this, 'PrivateSubnet2', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.101.0/24',
      availabilityZone: 'us-east-1b',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-private-subnet-1b` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'Type', value: 'Private' },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Create Public Route Table
    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.ref,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-public-rt` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Create default route to Internet Gateway
    new ec2.CfnRoute(this, 'PublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });

    // Associate Public Subnets with Public Route Table
    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnet1RouteTableAssociation', {
      subnetId: publicSubnet1.ref,
      routeTableId: publicRouteTable.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnet2RouteTableAssociation', {
      subnetId: publicSubnet2.ref,
      routeTableId: publicRouteTable.ref,
    });

    // Create Private Route Tables (for future use, no routes yet)
    const privateRouteTable1 = new ec2.CfnRouteTable(this, 'PrivateRouteTable1', {
      vpcId: vpc.ref,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-private-rt-1a` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    const privateRouteTable2 = new ec2.CfnRouteTable(this, 'PrivateRouteTable2', {
      vpcId: vpc.ref,
      tags: [
        { key: 'Name', value: `nagiyu-${environment}-private-rt-1b` },
        { key: 'Application', value: 'nagiyu' },
        { key: 'Environment', value: environment },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    // Associate Private Subnets with Private Route Tables
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnet1RouteTableAssociation', {
      subnetId: privateSubnet1.ref,
      routeTableId: privateRouteTable1.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnet2RouteTableAssociation', {
      subnetId: privateSubnet2.ref,
      routeTableId: privateRouteTable2.ref,
    });

    // Store references for L2 constructs
    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: vpc.ref,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      publicSubnetIds: [publicSubnet1.ref, publicSubnet2.ref],
      privateSubnetIds: [privateSubnet1.ref, privateSubnet2.ref],
    });

    // Export VPC ID
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.ref,
      exportName: `nagiyu-${environment}-vpc-id`,
      description: 'VPC ID',
    });

    // Export public subnet IDs
    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: `${publicSubnet1.ref},${publicSubnet2.ref}`,
      exportName: `nagiyu-${environment}-public-subnet-ids`,
      description: 'Public Subnet IDs (comma-separated)',
    });

    // Export private subnet IDs
    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: `${privateSubnet1.ref},${privateSubnet2.ref}`,
      exportName: `nagiyu-${environment}-private-subnet-ids`,
      description: 'Private Subnet IDs (comma-separated)',
    });

    // Export Internet Gateway ID
    new cdk.CfnOutput(this, 'InternetGatewayId', {
      value: igw.ref,
      exportName: `nagiyu-${environment}-igw-id`,
      description: 'Internet Gateway ID',
    });

    // Export VPC CIDR
    new cdk.CfnOutput(this, 'VpcCidr', {
      value: vpc.attrCidrBlock,
      exportName: `nagiyu-${environment}-vpc-cidr`,
      description: 'VPC CIDR block',
    });
  }
}
