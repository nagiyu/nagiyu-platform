/**
 * dev-sync Lambda Handler
 *
 * EventBridge Scheduler から定期実行される汎用 DynamoDB 同期 Lambda。
 * マニフェスト（lib/manifest.ts）に登録されたジョブ設定をもとに
 * prod DynamoDB テーブルを dev へコピーする。
 *
 * イベントの input にはジョブ設定 JSON を渡す（zod でバリデーション）。
 * 失敗時は例外を投げ、Lambda の Errors メトリクス・再試行に載せる。
 */

import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  type HandlerResponse,
} from '@nagiyu/aws';
import { JobConfigSchema } from './lib/types.js';
import { runCopy } from './lib/copy-logic.js';
import { DynamoDocumentClientStoreAdapter } from './lib/dynamo-store-adapter.js';
import { createSourceDynamoDBDocumentClient } from './lib/source-reader-client.js';
import { ERROR_MESSAGES } from './lib/errors.js';
import type { JobConfig, CopyResult } from './lib/types.js';

/**
 * EventBridge Scheduler からのイベント型
 *
 * Scheduler の「入力」フィールドに JobConfig JSON を直接設定する。
 * EventBridge Rules と異なり、Scheduler は input をそのままオブジェクトとして渡す。
 */
export type DevSyncEvent = JobConfig;

/**
 * ログ・エラー報告の context を作る。
 * 検証前の不正な入力でも呼ばれるため、文字列として取れる項目だけを拾い、例外を投げない。
 */
function getLogContext(event: unknown): Record<string, unknown> {
  if (typeof event !== 'object' || event === null) {
    return {};
  }
  const { sourceTable, destTable, strategy, delete: deleteMode } = event as Record<string, unknown>;
  return { sourceTable, destTable, strategy, delete: deleteMode };
}

/**
 * Lambda エントリポイント
 *
 * EventBridge Scheduler の「入力」に設定されたジョブ設定（JobConfig）を
 * zod でバリデーションし、コピーロジックを実行する。
 * 入力不正・コピー失敗のいずれも例外として投げる。
 */
export const handler = createScheduledHandler<unknown, HandlerResponse>(
  {
    serviceId: 'dev-sync',
    name: 'dev-sync',
    errorTitle: 'dev-sync ジョブ失敗',
    getLogContext,
  },
  async (event) => {
    // zod でイベント入力をバリデーション
    const parseResult = JobConfigSchema.safeParse(event);
    if (!parseResult.success) {
      throw new Error(`${ERROR_MESSAGES.INVALID_EVENT_INPUT}: ${parseResult.error.message}`);
    }

    const config = parseResult.data;

    // source（prod）と dest（dev）で別クライアント・別認証情報を使う。
    // source は SOURCE_READER_ROLE_ARN を AssumeRole した一時認証情報、
    // dest は Lambda 実行ロール（dev アカウント自身）のデフォルト認証情報。
    const sourceDocClient = createSourceDynamoDBDocumentClient();
    const destDocClient = getDynamoDBDocumentClient();
    const sourceStore = new DynamoDocumentClientStoreAdapter(sourceDocClient, config.sourceTable);
    const destStore = new DynamoDocumentClientStoreAdapter(destDocClient, config.destTable);

    const result: CopyResult = await runCopy(sourceStore, destStore, config);

    console.info('dev-sync ジョブが完了しました', {
      sourceTable: config.sourceTable,
      destTable: config.destTable,
      strategy: config.strategy,
      ...result,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'dev-sync ジョブが正常に完了しました',
        result,
      }),
    };
  }
);
