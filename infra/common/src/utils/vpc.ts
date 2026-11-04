import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import type { Environment } from '../types';
import { SSM_PARAMETERS } from './ssm';

/** 共有 VPC のパブリックサブネットが配置されている AZ。サブネット ID の並びと同じ順で並べる */
const SHARED_VPC_AVAILABILITY_ZONES = ['us-east-1a', 'us-east-1b'];

/** `importSharedVpc` の戻り値 */
export interface ImportedSharedVpc {
  /** 取り込んだ共有 VPC */
  vpc: ec2.IVpc;
  /** `Fn.split` で分割したパブリックサブネット ID の一覧 (トークン) */
  publicSubnetIds: string[];
}

/**
 * 共有 VPC を SSM パラメータから取り込む。
 *
 * 共有 VPC は dev / prod のどちらも us-east-1a と us-east-1b に 1 つずつパブリックサブネットを持つため、
 * 環境で分岐せず常に 2 サブネットとして取り込む。
 * サブネット ID はデプロイ時にしか分からないので、`Fn.select` でインデックス指定して参照する。
 *
 * @param scope VPC を作成するスコープ
 * @param id VPC の construct ID。既存リソースの論理 ID を保つため、呼び出し元の従来の ID を渡す
 * @param environment 対象環境
 */
export function importSharedVpc(
  scope: Construct,
  id: string,
  environment: Environment
): ImportedSharedVpc {
  const vpcId = ssm.StringParameter.valueForStringParameter(
    scope,
    SSM_PARAMETERS.VPC_ID(environment)
  );
  const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
    scope,
    SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment)
  );
  const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);

  const vpc = ec2.Vpc.fromVpcAttributes(scope, id, {
    vpcId,
    availabilityZones: SHARED_VPC_AVAILABILITY_ZONES,
    publicSubnetIds: SHARED_VPC_AVAILABILITY_ZONES.map((_, index) =>
      cdk.Fn.select(index, publicSubnetIds)
    ),
  });

  return { vpc, publicSubnetIds };
}
