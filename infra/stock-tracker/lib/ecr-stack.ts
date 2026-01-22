import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';
import { Construct } from 'constructs';

/**
 * Stock Tracker Web ECR Stack
 *
 * Web Lambda 用の ECR リポジトリを作成します。
 * 共通基盤の EcrStackBase を継承してメンテナンス性を向上。
 */
export class WebEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: Omit<EcrStackBaseProps, 'serviceName'>) {
    super(scope, id, {
      ...props,
      serviceName: 'stock-tracker-web',
    });
  }
}

/**
 * Stock Tracker Batch ECR Stack
 *
 * Batch Lambda 用の ECR リポジトリを作成します。
 * 共通基盤の EcrStackBase を継承してメンテナンス性を向上。
 */
export class BatchEcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: Omit<EcrStackBaseProps, 'serviceName'>) {
    super(scope, id, {
      ...props,
      serviceName: 'stock-tracker-batch',
    });
  }
}
