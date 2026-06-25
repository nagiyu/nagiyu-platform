/**
 * dev-sync Lambda Handler
 *
 * EventBridge Scheduler から定期実行される汎用 DynamoDB 同期 Lambda。
 * マニフェスト（lib/manifest.ts）に登録されたジョブ設定をもとに
 * prod DynamoDB テーブルを dev へコピーする。
 *
 * イベントの input にはジョブ設定 JSON を渡す（zod でバリデーション）。
 */

import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { JobConfigSchema } from './lib/types.js';
import { runCopy } from './lib/copy-logic.js';
import { DynamoDocumentClientStoreAdapter } from './lib/dynamo-store-adapter.js';
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
 * Lambda レスポンス型
 */
export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * Lambda エントリポイント
 *
 * EventBridge Scheduler の「入力」に設定されたジョブ設定（JobConfig）を
 * zod でバリデーションし、コピーロジックを実行する。
 */
export async function handler(event: unknown): Promise<HandlerResponse> {
  // zod でイベント入力をバリデーション
  const parseResult = JobConfigSchema.safeParse(event);
  if (!parseResult.success) {
    const errorMessage = `${ERROR_MESSAGES.INVALID_EVENT_INPUT}: ${parseResult.error.message}`;
    console.error(errorMessage, { event });
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: errorMessage,
        errors: parseResult.error.issues,
      }),
    };
  }

  const config = parseResult.data;

  console.info('dev-sync ジョブを開始します', {
    sourceTable: config.sourceTable,
    destTable: config.destTable,
    strategy: config.strategy,
    delete: config.delete,
  });

  try {
    const docClient = getDynamoDBDocumentClient();
    const sourceStore = new DynamoDocumentClientStoreAdapter(docClient, config.sourceTable);
    const destStore = new DynamoDocumentClientStoreAdapter(docClient, config.destTable);

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('dev-sync ジョブでエラーが発生しました', {
      sourceTable: config.sourceTable,
      destTable: config.destTable,
      error: errorMessage,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'dev-sync ジョブでエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
