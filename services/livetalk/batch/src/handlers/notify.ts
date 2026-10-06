import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  type HandlerResponse,
  type ScheduledEvent,
} from '@nagiyu/aws';
import {
  DynamoDBLifecycleRepository,
  DynamoDBMessageRepository,
  DynamoDBNotificationEventRepository,
  DynamoDBProfileRepository,
  DynamoDBPushSubscriptionRepository,
  DynamoDBTopicRepository,
  createLLMClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { notifyAllUsers } from '../usecases/notify.usecase.js';

const SERVICE_ID = 'livetalk';

export const handler = createScheduledHandler<ScheduledEvent, HandlerResponse>(
  { serviceId: SERVICE_ID, name: 'notify', errorTitle: '通知バッチ: 致命的エラー' },
  async (event) => {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);
    const lifecycleRepo = new DynamoDBLifecycleRepository(docClient, tableName);
    const messageRepo = new DynamoDBMessageRepository(docClient, tableName);
    const topicRepo = new DynamoDBTopicRepository(docClient, tableName);
    const pushSubscriptionRepo = new DynamoDBPushSubscriptionRepository(docClient, tableName);
    const notifEventRepo = new DynamoDBNotificationEventRepository(docClient, tableName);
    const llmClient = createLLMClient({ openai: { apiKey } });

    const result = await notifyAllUsers({
      profileRepo,
      lifecycleRepo,
      messageRepo,
      topicRepo,
      pushSubscriptionRepo,
      notifEventRepo,
      llmClient,
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
  }
);
