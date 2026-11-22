import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

/** Web (Lambda) 用リポジトリの serviceName。本体のスタックが同じ名前を導くために共有する */
export const WEB_ECR_SERVICE_NAME = 'codec-converter';

/** Batch (ffmpeg ワーカー) 用リポジトリの serviceName */
export const BATCH_ECR_SERVICE_NAME = 'codec-converter-batch';

export interface WebECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * codec-converter の Web (Lambda) 用 ECR スタック
 */
export class WebECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: WebECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: WEB_ECR_SERVICE_NAME,
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}

export interface BatchECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * codec-converter の Batch (ffmpeg ワーカー) 用 ECR スタック
 */
export class BatchECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: BatchECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: BATCH_ECR_SERVICE_NAME,
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
