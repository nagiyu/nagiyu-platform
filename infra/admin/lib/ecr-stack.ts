import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Admin サービス用の ECR スタック
 */
export class ECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: ECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'admin',
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
