import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBLifecycleRepository,
  DynamoDBMessageRepository,
  DynamoDBProfileRepository,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { learnAllUserActivities } from '../usecases/learn-user-activity.usecase.js';

const SERVICE_ID = 'livetalk';

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
  logger.info('[learn-user-activity] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();

    const messageRepo = new DynamoDBMessageRepository(docClient, tableName, defaultUlidFactory);
    const lifecycleRepo = new DynamoDBLifecycleRepository(docClient, tableName);
    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);

    const result = await learnAllUserActivities({
      profileRepo,
      messageRepo,
      lifecycleRepo,
    });

    logger.info('[learn-user-activity] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'ユーザー活動時間学習バッチが正常に完了しました',
        ...result,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('[learn-user-activity] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity: 'error',
      title: 'ユーザー活動時間学習バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'ユーザー活動時間学習バッチでエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
