import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, type EcrStackBaseProps } from '@nagiyu/infra-common';

export interface DevSyncEcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * dev-sync サービス用の ECR スタック
 *
 * 汎用 DynamoDB 同期 Lambda のコンテナイメージを保管する。
 */
export class DevSyncEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: DevSyncEcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'dev-sync',
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
