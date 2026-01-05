import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * DevUser のプロパティ
 */
export interface DevUserProps {
  /**
   * アプリケーション実行権限のマネージドポリシー
   */
  appRuntimePolicy: iam.IManagedPolicy;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;
}

/**
 * Codec Converter 開発用 IAM ユーザー
 *
 * このユーザーはローカル開発環境で使用され、Lambda 実行ロールと同じ権限を持つ。
 * これにより、開発者は本番環境と同じ権限でテストでき、デプロイ前に権限ミスを防げる。
 *
 * 権限:
 * - AppRuntimePolicy: Lambda と同じアプリケーション実行権限
 *
 * セキュリティ上の注意:
 * - アクセスキーとシークレットアクセスキーは AWS コンソールで手動発行すること
 * - 定期的にアクセスキーをローテーションすること (推奨: 90日ごと)
 * - アクセスキーは安全に保管すること (例: AWS Secrets Manager, 暗号化ファイル)
 */
export class DevUser extends iam.User {
  constructor(scope: Construct, id: string, props: DevUserProps) {
    super(scope, id, {
      userName: `codec-converter-dev-${props.envName}`,
      managedPolicies: [
        // Lambda と同じアプリケーション実行権限
        props.appRuntimePolicy,
      ],
    });
  }
}
