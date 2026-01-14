import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export interface EcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Tools サービス用の ECR スタック
 *
 * 既存の CloudFormation スタックとの互換性を保つため、
 * 論理ID を 'ToolsRepository' に指定しています。
 */
export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        // 既存のリソース名を維持
        repositoryName: `tools-app-${environment}`,
        // 既存の CloudFormation リソースとの互換性を保つため、論理IDを指定
        logicalId: 'ToolsRepository',
      },
    };

    super(scope, id, baseProps);
  }
}
