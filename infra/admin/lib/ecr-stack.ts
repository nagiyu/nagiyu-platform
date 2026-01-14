import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

export class ECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: ECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'admin',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        // 既存のリソース名を維持: nagiyu-admin-{env}
        repositoryName: `nagiyu-admin-${environment}`,
      },
    };

    super(scope, id, baseProps);
  }
}
