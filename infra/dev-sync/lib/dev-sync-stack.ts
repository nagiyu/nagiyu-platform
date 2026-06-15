import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import type { ManifestEntry } from './manifest';

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
 * - IAM: マニフェストの source ARN に read 専用、dest ARN に write のみ（最小権限）
 */
export class DevSyncStack extends cdk.Stack {
  public readonly syncFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: DevSyncStackProps) {
    super(scope, id, props);

    const { environment, ecrRepositoryName, manifest } = props;

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
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `dev-sync Lambda 実行ロール (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // マニフェストのエントリごとに IAM ポリシーを付与（最小権限）
    const processedSources = new Set<string>();
    const processedDests = new Set<string>();

    for (const entry of manifest) {
      // source テーブル: read 専用（Scan/Query のみ）
      if (!processedSources.has(entry.sourceTable)) {
        processedSources.add(entry.sourceTable);
        const sourceArn = `arn:aws:dynamodb:${region}:${account}:table/${entry.sourceTable}`;
        executionRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Scan', 'dynamodb:Query'],
            resources: [sourceArn, `${sourceArn}/index/*`],
          })
        );
      }

      // dest テーブル: write のみ（Put/Delete。Get は不要）
      if (!processedDests.has(entry.destTable)) {
        processedDests.add(entry.destTable);
        const destArn = `arn:aws:dynamodb:${region}:${account}:table/${entry.destTable}`;
        executionRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem', 'dynamodb:DeleteItem'],
            resources: [destArn, `${destArn}/index/*`],
          })
        );
        // dest テーブルのスキャン（差分削除で dev 側を読む必要があるため）
        executionRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Scan'],
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
      description: `dev-sync EventBridge Scheduler 実行ロール (${environment})`,
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
