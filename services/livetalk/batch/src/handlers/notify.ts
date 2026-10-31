import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  type HandlerResponse,
  type ScheduledEvent,
} from '@nagiyu/aws';
import {
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createProfileRepository,
  createPushSubscriptionRepository,
  createTopicRepository,
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

    const profileRepo = createProfileRepository(docClient, tableName);
    const lifecycleRepo = createLifecycleRepository(docClient, tableName);
    const messageRepo = createMessageRepository(docClient, tableName);
    const topicRepo = createTopicRepository(docClient, tableName);
    const pushSubscriptionRepo = createPushSubscriptionRepository(docClient, tableName);
    const notifEventRepo = createNotificationEventRepository(docClient, tableName);
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
