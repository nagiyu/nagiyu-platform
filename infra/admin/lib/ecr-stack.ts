import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Admin サービス用の ECR スタック
 *
 * 既存の CloudFormation スタックとの互換性を保つため、
 * 論理ID を 'AdminRepository' に指定しています。
 */
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
        // 既存の CloudFormation リソースとの互換性を保つため、論理IDを指定
        logicalId: 'AdminRepository',
      },
    };

    super(scope, id, baseProps);
  }
}
