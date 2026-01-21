import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps, getEcrRepositoryName } from '@nagiyu/infra-common';

export interface BatchECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * niconico-mylist-assistant サービスの batch パッケージ用 ECR スタック
 * Phase 3 で使用予定
 */
export class BatchECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: BatchECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'niconico-mylist-assistant-batch',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        repositoryName: getEcrRepositoryName('niconico-mylist-assistant-batch', environment as 'dev' | 'prod'),
      },
    };

    super(scope, id, baseProps);
  }
}
