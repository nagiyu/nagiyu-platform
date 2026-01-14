import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
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
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        // リソース名を既存の `tools-app-{env}` から統一命名規則に移行
        // 注意: これによりリソース名が変更されます
        // tools-app-dev -> nagiyu-tools-ecr-dev
        repositoryName: `tools-app-${environment}`,
      },
    };

    super(scope, id, baseProps);
  }
}
