import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBTopicRepository,
  DynamoDBMessageRepository,
  DynamoDBWebRawRepository,
  DynamoDBConsolidationCursorRepository,
  DynamoDBProfileRepository,
  DynamoDBNoteRepository,
  OpenAIClient,
  OpenAIEmbeddingClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import {
  consolidateAllConversations,
  type ConsolidateAllConversationsResult,
} from '../usecases/consolidate-conversations.usecase.js';

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
    logger.warn('[consolidate-conversations] エラー通知の送信に失敗しました', {
      eventId,
      error: toErrorMessage(reportError),
    });
  }
}

export interface ScheduledEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

export interface HandlerResponse {
  statusCode: number;
  body: string;
}

export async function handler(event: ScheduledEvent): Promise<HandlerResponse> {
  logger.info('[consolidate-conversations] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  let result: ConsolidateAllConversationsResult;
  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const topicRepo = new DynamoDBTopicRepository(docClient, tableName, defaultUlidFactory);
    const messageRepo = new DynamoDBMessageRepository(docClient, tableName, defaultUlidFactory);
    const webRawRepo = new DynamoDBWebRawRepository(docClient, tableName, defaultUlidFactory);
    const cursorRepo = new DynamoDBConsolidationCursorRepository(docClient, tableName);
    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);
    const noteRepo = new DynamoDBNoteRepository(docClient, tableName);
    const llmClient = new OpenAIClient({ apiKey });
    const embeddingClient = new OpenAIEmbeddingClient({ apiKey });

    result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient,
      embeddingClient,
    });
  } catch (error) {
    // 致命的エラー: 報告して rethrow（非同期 Lambda を失敗させ DLQ/リトライに乗せる）
    const errorMessage = toErrorMessage(error);
    logger.error('[consolidate-conversations] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: '集約バッチ: 致命的エラー',
        message: errorMessage,
        context: { eventId: event.id },
      },
      event.id
    );
    throw error;
  }

  logger.info('[consolidate-conversations] バッチ完了', {
    eventId: event.id,
    ...result,
  });

  if (result.failedUsers > 0) {
    // 部分失敗: 報告して throw（非同期 Lambda を失敗させ DLQ/リトライに乗せる）
    const message = `集約バッチで ${result.failedUsers} 件のユーザー処理が失敗しました`;
    logger.error('[consolidate-conversations] 部分失敗', {
      eventId: event.id,
      failedUsers: result.failedUsers,
      failedUserIds: result.failedUserIds,
    });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: '集約バッチ: 部分失敗',
        message,
        context: { eventId: event.id, failedUserIds: result.failedUserIds },
      },
      event.id
    );
    throw new Error(message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '集約バッチが正常に完了しました',
      ...result,
    }),
  };
}
