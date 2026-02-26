import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface EcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Tools サービス用の ECR スタック
 */
export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
