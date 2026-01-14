import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface ECRStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Auth サービス用の ECR スタック
 *
 * 既存の CloudFormation スタックとの互換性を保つため、
 * 論理ID を 'AuthRepository' に指定しています。
 */
export class ECRStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: ECRStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'auth',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        // 既存のリソース名を維持: nagiyu-auth-{env}
        repositoryName: `nagiyu-auth-${environment}`,
        // 既存の CloudFormation リソースとの互換性を保つため、論理IDを指定
        logicalId: 'AuthRepository',
      },
    };

    super(scope, id, baseProps);
  }
}
