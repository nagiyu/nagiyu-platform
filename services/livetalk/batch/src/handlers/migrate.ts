/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション Lambda ハンドラ（手動 invoke 専用、throwaway コード）。
 *
 * EventBridge スケジュールは付けない。ペイロード（`MigratePayload`）をそのまま
 * Lambda イベントとして受け取る。
 *
 * 移行完了・Issue クローズ後は本ファイルを削除してよい。
 */
import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBTopicRepository,
  DynamoDBProfileRepository,
  OpenAIClient,
  OpenAIEmbeddingClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import {
  runMigration,
  type MigratePayload,
  type MigrateResult,
} from '../usecases/migrate.usecase.js';

const SERVICE_ID = 'livetalk';

/**
 * エラー通知は best-effort。通知自体が失敗しても、後続の throw（Lambda 失敗→DLQ/リトライ）を
 * 握り潰さないよう warn に留める。
 */
async function safeReportErrorEvent(
  params: Parameters<typeof reportErrorEvent>[0],
  eventId: string
): Promise<void> {
  try {
    await reportErrorEvent(params);
  } catch (reportError) {
    logger.warn('[migrate] エラー通知の送信に失敗しました', {
      eventId,
      error: toErrorMessage(reportError),
    });
  }
}

export interface HandlerResponse {
  statusCode: number;
  body: string;
}

/**
 * 手動 invoke 専用のハンドラ。Lambda イベント（＝`MigratePayload`）をそのまま usecase に渡す。
 */
export async function handler(event: MigratePayload): Promise<HandlerResponse> {
  const eventId = `migrate-${Date.now()}`;

  logger.info('[migrate] バッチ開始', {
    eventId,
    targetUserId: event.targetUserId,
    characterId: event.characterId,
    dryRun: event.dryRun,
    migrate: event.migrate,
    wipeNewFirst: event.wipeNewFirst,
    deleteOldAfter: event.deleteOldAfter,
  });

  let result: MigrateResult;
  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const topicRepo = new DynamoDBTopicRepository(docClient, tableName, defaultUlidFactory);
    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);
    const llmClient = new OpenAIClient({ apiKey });
    const embeddingClient = new OpenAIEmbeddingClient({ apiKey });

    result = await runMigration({
      payload: event,
      profileRepo,
      docClient,
      tableName,
      topicRepo,
      llmClient,
      embeddingClient,
      ulidFactory: defaultUlidFactory,
    });
  } catch (error) {
    // 致命的エラー（環境ガード含む）: 報告して rethrow（Lambda を失敗させる）
    const errorMessage = toErrorMessage(error);
    logger.error('[migrate] バッチ失敗', { eventId, error: errorMessage });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: '一回性移行バッチ: 致命的エラー',
        message: errorMessage,
        context: { eventId },
      },
      eventId
    );
    throw error;
  }

  logger.info('[migrate] バッチ完了', { eventId, ...result, scopeReports: undefined });

  if (result.failedScopes > 0) {
    // 部分失敗: 報告して throw（Lambda を失敗させ、再実行判断は人が行う）
    const message = `一回性移行バッチで ${result.failedScopes} 件のスコープ処理が失敗しました`;
    logger.error('[migrate] 部分失敗', {
      eventId,
      failedScopes: result.failedScopes,
      failedScopeKeys: result.failedScopeKeys,
    });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: '一回性移行バッチ: 部分失敗',
        message,
        context: { eventId, failedScopeKeys: result.failedScopeKeys },
      },
      eventId
    );
    throw new Error(message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '一回性移行バッチが正常に完了しました',
      ...result,
    }),
  };
}
