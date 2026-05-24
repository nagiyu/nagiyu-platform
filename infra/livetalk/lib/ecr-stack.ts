import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  EcrStackBase,
  EcrStackBaseProps,
  Environment,
  SSM_PARAMETERS,
} from '@nagiyu/infra-common';

export interface LiveTalkEcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * LiveTalk サービス用の ECR スタック
 *
 * - 命名規則: `nagiyu-livetalk-ecr-{env}`
 * - SSM Parameter に repository-name / repository-uri を格納
 * - Component: livetalk タグを付与
 */
export class LiveTalkEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: LiveTalkEcrStackProps) {
    const { environment, ...stackProps } = props;
    const ssmEnvironment = environment as Environment;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'livetalk',
      environment: ssmEnvironment,
    };

    super(scope, id, baseProps);

    cdk.Tags.of(this).add('Component', 'livetalk');

    new ssm.StringParameter(this, 'EcrRepositoryNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ECR_REPOSITORY_NAME(ssmEnvironment),
      stringValue: this.repository.repositoryName,
      description: 'LiveTalk ECR repository name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'EcrRepositoryUriParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ECR_REPOSITORY_URI(ssmEnvironment),
      stringValue: this.repository.repositoryUri,
      description: 'LiveTalk ECR repository URI',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
