import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import type { Environment } from '../types/environment';
import {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_LAMBDA_LOG_RETENTION,
  DEFAULT_LAMBDA_TRACING,
} from '../constants/defaults';
import { grantErrorEventsWrite } from '../grants/error-events-writer';

/**
 * ECR イメージ Lambda 関数のプロパティ
 */
export interface EcrImageFunctionProps {
  /**
   * 関数名
   */
  functionName: string;

  /**
   * タグ `Service` の値（例: stock-tracker, admin-batch）。
   * 関数名やスタックのサービス名と一致するとは限らないため、呼び出し元が決める。
   */
  serviceName: string;

  /**
   * デプロイ環境（dev または prod）。タグと error-events の接続先に使う。
   */
  deployEnvironment: Environment;

  /**
   * イメージを取り込む ECR リポジトリ（タグは `latest` 固定）
   */
  repository: ecr.IRepository;

  /**
   * イメージのコマンド上書き（同一イメージから複数ハンドラを使い分けるときに指定）
   */
  cmd?: string[];

  /**
   * 実行ロール。省略すると Lambda が自動生成する。
   * 既存スタックのロールは名前固定のため、置き換えを避けるには呼び出し元のロールを渡す。
   */
  role?: iam.IRole;

  /**
   * メモリサイズ (MB)
   * @default 512
   */
  memorySize?: number;

  /**
   * タイムアウト
   * @default 30 秒
   */
  timeout?: cdk.Duration;

  /**
   * アーキテクチャ
   * @default X86_64
   */
  architecture?: lambda.Architecture;

  /**
   * 環境変数
   */
  environment?: Record<string, string>;

  /**
   * 関数の説明
   */
  description?: string;

  /**
   * 予約済み同時実行数
   */
  reservedConcurrentExecutions?: number;

  /**
   * エフェメラルストレージ (/tmp) のサイズ
   */
  ephemeralStorageSize?: cdk.Size;

  /**
   * 非同期呼び出しの再試行回数
   */
  retryAttempts?: number;

  /**
   * 非同期呼び出し失敗時の送り先 DLQ
   */
  deadLetterQueue?: sqs.IQueue;

  /**
   * X-Ray トレーシングのモード
   * @default Tracing.ACTIVE
   */
  tracing?: lambda.Tracing;

  /**
   * error-events テーブルへの書き込みを有効にするか。
   * 有効なら環境変数 `ERROR_EVENTS_TABLE_NAME` を設定し、実行ロールに書き込み権限を付与する。
   * @default true
   */
  enableErrorEvents?: boolean;

  /**
   * 既存のロググループを引き継ぐ。
   *
   * true のときは CloudFormation 管理の LogGroup を作らず、CDK の LogRetention
   * カスタムリソースで既存ロググループの保持期間だけを設定する。
   *
   * @deprecated 既存ロググループを引き継ぐ関数専用。新しく作る関数では付けない。
   * dev / prod には CloudFormation 管理外の同名ロググループが既にあり、LogGroup を
   * 作ると名前が衝突してデプロイが失敗するため、既存の関数だけがこの指定で回避している。
   * 新しい関数にはロググループが無いので、既定の LogGroup 作成で足りる。
   */
  adoptExistingLogGroup?: boolean;
}

/**
 * ECR イメージから Lambda 関数を作る。
 *
 * ログ (保持期間 30 日)、X-Ray、タグ (Application / Service / Environment)、
 * error-events への書き込みを既定でそろえる。
 *
 * Construct でラップせず、渡された scope に直接関数を作る。ラップすると
 * 論理 ID にラッパーの id が前置されて既存スタックの関数・ロールが置き換わり、
 * 名前固定のリソースではデプロイが失敗するため。関数の construct id は `id` そのまま、
 * ロググループは `${id}LogGroup` になる。
 */
export function createEcrImageFunction(
  scope: Construct,
  id: string,
  props: EcrImageFunctionProps
): lambda.Function {
  const {
    functionName,
    serviceName,
    deployEnvironment,
    repository,
    cmd,
    role,
    memorySize = DEFAULT_LAMBDA_CONFIG.memorySize,
    timeout = cdk.Duration.seconds(DEFAULT_LAMBDA_CONFIG.timeout),
    architecture = lambda.Architecture.X86_64,
    environment,
    description,
    reservedConcurrentExecutions,
    ephemeralStorageSize,
    retryAttempts,
    deadLetterQueue,
    tracing = DEFAULT_LAMBDA_TRACING,
    enableErrorEvents = true,
    adoptExistingLogGroup = false,
  } = props;

  // 呼び出し元の指定より優先する。付与する権限の対象テーブルは環境ごとに 1 つに決まっており、
  // 環境変数だけ別のテーブルを指すと書き込みが権限エラーになるため。
  const variables = enableErrorEvents
    ? { ...environment, ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${deployEnvironment}` }
    : environment;

  const fn = new lambda.Function(scope, id, {
    functionName,
    runtime: lambda.Runtime.FROM_IMAGE,
    handler: lambda.Handler.FROM_IMAGE,
    code: lambda.Code.fromEcrImage(repository, {
      tagOrDigest: 'latest',
      cmd,
    }),
    role,
    memorySize,
    timeout,
    architecture,
    environment: variables,
    description,
    reservedConcurrentExecutions,
    ephemeralStorageSize,
    retryAttempts,
    deadLetterQueue,
    tracing,
    ...(adoptExistingLogGroup
      ? { logRetention: DEFAULT_LAMBDA_LOG_RETENTION }
      : {
          logGroup: new logs.LogGroup(scope, `${id}LogGroup`, {
            logGroupName: `/aws/lambda/${functionName}`,
            retention: DEFAULT_LAMBDA_LOG_RETENTION,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          }),
        }),
  });

  if (enableErrorEvents) {
    grantErrorEventsWrite(scope, fn, deployEnvironment);
  }

  cdk.Tags.of(fn).add('Application', 'nagiyu');
  cdk.Tags.of(fn).add('Service', serviceName);
  cdk.Tags.of(fn).add('Environment', deployEnvironment);

  return fn;
}
