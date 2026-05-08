import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface BatchEcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Admin Batch サービス用の ECR スタック
 *
 * alarm-ingest / stream-handler Lambda 用のコンテナイメージを保管する。
 */
export class BatchEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: BatchEcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'admin-batch',
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
