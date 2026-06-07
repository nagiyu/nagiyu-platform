import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBInterestRepository,
  DynamoDBKnowledgeRepository,
  DynamoDBLifecycleRepository,
  DynamoDBMessageRepository,
  DynamoDBNotificationEventRepository,
  DynamoDBPushSubscriptionRepository,
  OpenAIEmbeddingClient,
  createLLMClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { notifyAllUsers } from '../usecases/notify.usecase.js';

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
  logger.info('[notify] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const lifecycleRepo = new DynamoDBLifecycleRepository(docClient, tableName);
    const messageRepo = new DynamoDBMessageRepository(docClient, tableName);
    const knowledgeRepo = new DynamoDBKnowledgeRepository(docClient, tableName);
    const pushSubscriptionRepo = new DynamoDBPushSubscriptionRepository(docClient, tableName);
    const notifEventRepo = new DynamoDBNotificationEventRepository(docClient, tableName);
    const interestRepo = new DynamoDBInterestRepository(docClient, tableName);
    const llmClient = createLLMClient({ openai: { apiKey } });
    const embeddingClient = new OpenAIEmbeddingClient({ apiKey });

    const result = await notifyAllUsers({
      docClient,
      tableName,
      lifecycleRepo,
      messageRepo,
      knowledgeRepo,
      pushSubscriptionRepo,
      notifEventRepo,
      interestRepo,
      llmClient,
      embeddingClient,
      ulidFactory: defaultUlidFactory,
    });

    logger.info('[notify] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '通知バッチが正常に完了しました',
        ...result,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('[notify] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity: 'error',
      title: '通知バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '通知バッチでエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
