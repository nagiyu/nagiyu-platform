import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface EcrStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
    };

    super(scope, id, baseProps);
  }
}
