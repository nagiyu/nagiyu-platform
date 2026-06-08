import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcrStackBase, type EcrStackBaseProps, type Environment } from '@nagiyu/infra-common';

export interface LiveTalkBatchEcrStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * LiveTalk バッチ用 ECR スタック（Phase 3c / Issue #3281）
 *
 * - 命名規則: `nagiyu-livetalk-batch-ecr-{env}`（`getEcrRepositoryName` と一致）
 * - リポジトリ名は命名規則から決定論的に導出できるため SSM には格納しない。
 *   参照側（batch-stack）は `getEcrRepositoryName('livetalk-batch', env)` で
 *   独立に組み立てる（SSM もクロススタック参照も介さない方針）。
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
  }
}
