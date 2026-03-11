import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface EcrStackProps extends cdk.StackProps {
  environment: string;
}

export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'share-together',
      environment: environment as 'dev' | 'prod',
    };

    super(scope, id, baseProps);
  }
}
