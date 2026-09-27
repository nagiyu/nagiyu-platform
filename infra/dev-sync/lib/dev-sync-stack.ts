import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import type { ManifestEntry } from './manifest';

/**
 * prod アカウント ID（秘匿情報ではないため定数化する）
 *
 * `infra/shared/lib/account-scope.ts` の `ACCOUNT_IDS.prod` と同じ値。
 * `infra/dev-sync` パッケージは `infra/shared` に依存しないため
 * （パッケージを跨いだ import はしない方針）、値は手動同期する。
 */
const PROD_ACCOUNT_ID = '166562222746';

/**
 * dev-sync 用 prod 読み取りロール名（固定値）
 *
 * `infra/shared/lib/iam/dev-sync-source-reader-stack.ts` で prod アカウントに
 * 作成済みのロール名と一致させる必要がある。
 */
const SOURCE_READER_ROLE_NAME = 'nagiyu-dev-sync-source-reader';

/**
 * dev-sync が prod テーブルを読み取る際に AssumeRole するロールの ARN
 */
const SOURCE_READER_ROLE_ARN = `arn:aws:iam::${PROD_ACCOUNT_ID}:role/${SOURCE_READER_ROLE_NAME}`;

export interface DevSyncStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  /**
   * dev-sync ECR リポジトリ名
   */
  ecrRepositoryName: string;
  /**
   * ジョブマニフェスト
   * Phase A は空配列。Phase B/C で各サービスのエントリを追加する。
   */
  manifest: ManifestEntry[];
}

/**
 * dev-sync メインスタック
 *
 * - 汎用 DynamoDB コピー Lambda（Docker イメージ）を 1 つデプロイ
 * - マニフェストの各エントリに対して EventBridge Scheduler スケジュールを作成
 *   - Lambda の input にジョブ設定を渡す
 *   - Phase A はマニフェストが空のためスケジュール 0 個
 * - IAM:
 *   - source（prod）テーブルへの直接の読み取り権限は付与しない。
 *     prod テーブルは AWS マネージドキー暗号化のためリソースポリシーによる
 *     クロスアカウント許可が使えないため、prod 側の読み取り専用ロール
 *     （`nagiyu-dev-sync-source-reader`）を AssumeRole して読み取る。
 *     AssumeRole 先はこの 1 ロールの ARN に固定し、Lambda の環境変数
 *     `SOURCE_READER_ROLE_ARN` で渡す。
 *   - dest（自アカウントの `-dev` テーブル）には PutItem / DeleteItem / Scan を
 *     現行どおり自アカウントに付与（最小権限）
 */
export class DevSyncStack extends cdk.Stack {
  public readonly syncFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: DevSyncStackProps) {
    super(scope, id, props);

    const { environment, ecrRepositoryName, manifest } = props;

    // ─────────────────────────────────────────
    // synth 時の安全ガード: dest テーブルが "-dev" で終わることを確認する
    // 実行時ガード（copy-logic.ts）と合わせた多層防御により、
    // prod テーブルへの IAM 書込権限が CDK 合成時点で発行されることを防ぐ。
    // ─────────────────────────────────────────
    for (const entry of manifest) {
      if (!entry.destTable.endsWith('-dev')) {
        throw new Error(
          `マニフェストのコピー先テーブル "${entry.destTable}" が "-dev" で終わっていません。` +
            `prod テーブルへの IAM 書込権限発行を防ぐため、synth を中止します。`
        );
      }
    }

    // 既存 ECR リポジトリの参照
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      ecrRepositoryName
    );

    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // ─────────────────────────────────────────
    // Lambda 実行ロール（最小権限）
    // ─────────────────────────────────────────
    const executionRole = new iam.Role(this, 'SyncFunctionExecutionRole', {
      roleName: `nagiyu-dev-sync-${environment}-execution`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for dev-sync Lambda (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // source（prod）テーブルへの直接の読み取り権限は付与せず、
    // prod 側の読み取り専用ロール（SOURCE_READER_ROLE_ARN）への AssumeRole のみを許可する。
    // このロール自身が manifest の source テーブルに対する Scan/Query/GetItem を
    // 最小権限で制御するため、実行ロール側でテーブル単位のポリシーは持たない。
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [SOURCE_READER_ROLE_ARN],
      })
    );

    // マニフェストのエントリごとに dest 側の IAM ポリシーを付与（最小権限）
    // dest テーブルは PutItem 付与済みかどうかをキャッシュ
    const processedDestsPut = new Set<string>();
    // dest テーブルは DeleteItem/Scan 付与済みかどうかをキャッシュ（delete=on エントリにのみ付与）
    const processedDestsDelete = new Set<string>();

    for (const entry of manifest) {
      // dest テーブル: PutItem は常時付与
      if (!processedDestsPut.has(entry.destTable)) {
        processedDestsPut.add(entry.destTable);
        const destArn = `arn:aws:dynamodb:${region}:${account}:table/${entry.destTable}`;
        executionRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [destArn],
          })
        );
      }

      // dest テーブル: DeleteItem/Scan は delete='on' のエントリの dest にのみ付与
      // （gsiWindow や delete=off のエントリの dest に不要な権限を与えない最小権限設計）
      if (entry.delete === 'on' && !processedDestsDelete.has(entry.destTable)) {
        processedDestsDelete.add(entry.destTable);
        const destArn = `arn:aws:dynamodb:${region}:${account}:table/${entry.destTable}`;
        executionRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:DeleteItem', 'dynamodb:Scan'],
            resources: [destArn],
          })
        );
      }
    }

    // ─────────────────────────────────────────
    // Lambda 関数（Docker イメージ）
    // ─────────────────────────────────────────
    this.syncFunction = new lambda.Function(this, 'SyncFunction', {
      functionName: `nagiyu-dev-sync-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(repository, {
        tagOrDigest: 'latest',
        cmd: ['services/dev-sync/batch/dist/src/sync-handler.handler'],
      }),
      role: executionRole,
      memorySize: 256,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        SOURCE_READER_ROLE_ARN: SOURCE_READER_ROLE_ARN,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      description: 'prod → dev DynamoDB 汎用同期 Lambda（dev-sync）',
    });

    // ─────────────────────────────────────────
    // EventBridge Scheduler 用ロール
    // ─────────────────────────────────────────
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: `Execution role for dev-sync EventBridge Scheduler (${environment})`,
    });
    schedulerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [this.syncFunction.functionArn],
      })
    );

    // ─────────────────────────────────────────
    // EventBridge Scheduler スケジュール
    // Phase A はマニフェストが空のためスケジュールは 0 個
    // ─────────────────────────────────────────
    manifest.forEach((entry, index) => {
      // スケジュール名はテーブル名から生成（一意性を確保）
      const safeName = entry.destTable.replace(/[^a-zA-Z0-9-_]/g, '-');
      const scheduleName = `dev-sync-${safeName}-${index}`;

      // EventBridge Scheduler の input: ジョブ設定 JSON
      const jobInput = JSON.stringify({
        sourceTable: entry.sourceTable,
        destTable: entry.destTable,
        strategy: entry.strategy,
        ...(entry.scope !== undefined ? { scope: entry.scope } : {}),
        delete: entry.delete,
        ...(entry.gsi !== undefined ? { gsi: entry.gsi } : {}),
      });

      new scheduler.CfnSchedule(this, `Schedule${index}`, {
        name: scheduleName,
        scheduleExpression: entry.schedule,
        flexibleTimeWindow: {
          mode: 'OFF',
        },
        target: {
          arn: this.syncFunction.functionArn,
          roleArn: schedulerRole.roleArn,
          input: jobInput,
        },
        description: `dev-sync: ${entry.sourceTable} → ${entry.destTable}`,
        state: 'ENABLED',
      });
    });

    // ─────────────────────────────────────────
    // タグ・Outputs
    // ─────────────────────────────────────────
    cdk.Tags.of(this.syncFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.syncFunction).add('Service', 'dev-sync');
    cdk.Tags.of(this.syncFunction).add('Environment', environment);

    new cdk.CfnOutput(this, 'SyncFunctionArn', {
      value: this.syncFunction.functionArn,
      description: 'dev-sync Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'SyncFunctionName', {
      value: this.syncFunction.functionName,
      description: 'dev-sync Lambda Function 名',
    });

    new cdk.CfnOutput(this, 'ManifestEntryCount', {
      value: String(manifest.length),
      description: 'マニフェストに登録されたジョブ数',
    });
  }
}
