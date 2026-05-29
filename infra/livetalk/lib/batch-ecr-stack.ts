import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  EcrStackBase,
  type EcrStackBaseProps,
  type Environment,
  SSM_PARAMETERS,
} from '@nagiyu/infra-common';

export interface LiveTalkBatchEcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * LiveTalk バッチ用 ECR スタック（Phase 3c / Issue #3281）
 *
 * - 命名規則: `nagiyu-livetalk-batch-ecr-{env}`
 * - SSM Parameter に repository-name / repository-uri を格納
 * - Component: livetalk タグを付与
 */
export class LiveTalkBatchEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: LiveTalkBatchEcrStackProps) {
    const { environment, ...stackProps } = props;
    const ssmEnvironment = environment as Environment;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'livetalk-batch',
      environment: ssmEnvironment,
    };

    super(scope, id, baseProps);

    cdk.Tags.of(this).add('Component', 'livetalk');

    new ssm.StringParameter(this, 'BatchEcrRepositoryNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_BATCH_ECR_REPOSITORY_NAME(ssmEnvironment),
      stringValue: this.repository.repositoryName,
      description: 'LiveTalk Batch ECR repository name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'BatchEcrRepositoryUriParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_BATCH_ECR_REPOSITORY_URI(ssmEnvironment),
      stringValue: this.repository.repositoryUri,
      description: 'LiveTalk Batch ECR repository URI',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
