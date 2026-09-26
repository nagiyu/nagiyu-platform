import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ACCOUNT_IDS } from '../account-scope';

/** dev-sync（dev アカウント側 Lambda）の実行ロール名（後続 PR で固定名にする予定） */
const DEV_SYNC_EXECUTION_ROLE_NAME = 'nagiyu-dev-sync-dev-execution';

/** このロールの IAM ロール名（固定値） */
const SOURCE_READER_ROLE_NAME = 'nagiyu-dev-sync-source-reader';

/**
 * dev-sync が prod → dev コピー対象として読み取る DynamoDB テーブル。
 *
 * `infra/dev-sync/lib/manifest.ts` の `MANIFEST` に登場する `sourceTable` の
 * 一覧と一致させる必要がある（パッケージを跨いだ import はしないため、値は手動同期）。
 */
const SOURCE_TABLE_NAMES = [
  'nagiyu-niconico-mylist-assistant-dynamodb-prod',
  'nagiyu-stock-tracker-main-prod',
] as const;

/**
 * dev-sync 用 prod 読み取りロール Stack（prod アカウントにのみ作成）
 *
 * 設計意図:
 * - dev-sync（prod の DynamoDB を dev にコピーする Lambda）は dev アカウントで動かし、
 *   このロールを AssumeRole して prod テーブルを読み取る。
 * - なぜアカウント跨ぎ AssumeRole か: 対象テーブルは AWS マネージドキー（KMS）で
 *   暗号化されており、DynamoDB のリソースポリシーによるクロスアカウント読み取り許可が
 *   使えないため、IAM ロールの AssumeRole でアカウント境界を越える。
 * - なぜ prod 側に置くか: 読み取り対象（prod テーブル）を持つアカウント側でロールと
 *   権限を管理する方が、prod データへのアクセス経路を prod 側だけで完結して把握できる。
 * - 信頼ポリシーはアカウントプリンシパル + `aws:PrincipalArn` 条件にしている。
 *   dev 側の実行ロール ARN を直接プリンシパルに書くと、そのロールがまだ存在しない時点
 *   （本 PR は prod 側の準備のみで dev 側の実行ロールは後続 PR で作成する）で IAM が
 *   ロール作成を拒否するため。
 */
export class DevSyncSourceReaderStack extends cdk.Stack {
  public readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const devSyncExecutionRoleArn = `arn:aws:iam::${ACCOUNT_IDS.dev}:role/${DEV_SYNC_EXECUTION_ROLE_NAME}`;

    this.role = new iam.Role(this, 'SourceReaderRole', {
      roleName: SOURCE_READER_ROLE_NAME,
      assumedBy: new iam.AccountPrincipal(ACCOUNT_IDS.dev).withConditions({
        ArnEquals: {
          'aws:PrincipalArn': devSyncExecutionRoleArn,
        },
      }),
    });

    for (const tableName of SOURCE_TABLE_NAMES) {
      const tableArn = cdk.Stack.of(this).formatArn({
        service: 'dynamodb',
        resource: 'table',
        resourceName: tableName,
      });

      this.role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          sid: `AllowReadTable${this.toPascalCase(tableName)}`,
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
          resources: [tableArn, `${tableArn}/index/*`],
        })
      );
    }

    new cdk.CfnOutput(this, 'SourceReaderRoleArnExport', {
      value: this.role.roleArn,
      description: 'dev-sync が prod テーブルを読み取る際に AssumeRole するロールの ARN',
    });
  }

  private toPascalCase(value: string): string {
    return value
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('');
  }
}
