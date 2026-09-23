import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBTopicRepository,
  DynamoDBWebRawRepository,
  DynamoDBStudyTopicRepository,
  DynamoDBLifecycleRepository,
  DynamoDBProfileRepository,
  OpenAIResearchClient,
  OpenAIClient,
  LLMWebFactChangeDetector,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { acquireAllUsers, type AcquireAllUsersResult } from '../usecases/acquire.usecase.js';

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
    logger.warn('[acquire] エラー通知の送信に失敗しました', {
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
  logger.info('[acquire] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  let result: AcquireAllUsersResult;
  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const topicRepo = new DynamoDBTopicRepository(docClient, tableName, defaultUlidFactory);
    const webRawRepo = new DynamoDBWebRawRepository(docClient, tableName, defaultUlidFactory);
    const studyTopicRepo = new DynamoDBStudyTopicRepository(docClient, tableName);
    const lifecycleRepo = new DynamoDBLifecycleRepository(docClient, tableName);
    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);
    const researchClient = new OpenAIResearchClient({ apiKey });
    const llmClient = new OpenAIClient({ apiKey });
    const changeDetector = new LLMWebFactChangeDetector(llmClient);

    result = await acquireAllUsers({
      profileRepo,
      lifecycleRepo,
      topicRepo,
      webRawRepo,
      studyTopicRepo,
      researchClient,
      changeDetector,
      ulidFactory: defaultUlidFactory,
    });
  } catch (error) {
    // 致命的エラー: 報告して rethrow（非同期 Lambda を失敗させ DLQ/リトライに乗せる）
    const errorMessage = toErrorMessage(error);
    logger.error('[acquire] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: 'acquire バッチ: 致命的エラー',
        message: errorMessage,
        context: { eventId: event.id },
      },
      event.id
    );
    throw error;
  }

  logger.info('[acquire] バッチ完了', {
    eventId: event.id,
    ...result,
  });

  if (result.failedUsers > 0) {
    // 部分失敗: 報告して throw（非同期 Lambda を失敗させ DLQ/リトライに乗せる）
    const message = `acquire バッチで ${result.failedUsers} 件のユーザー処理が失敗しました`;
    logger.error('[acquire] 部分失敗', {
      eventId: event.id,
      failedUsers: result.failedUsers,
      failedUserIds: result.failedUserIds,
    });
    await safeReportErrorEvent(
      {
        serviceId: SERVICE_ID,
        severity: 'error',
        title: 'acquire バッチ: 部分失敗',
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
      message: 'acquire バッチが正常に完了しました',
      ...result,
    }),
  };
}
