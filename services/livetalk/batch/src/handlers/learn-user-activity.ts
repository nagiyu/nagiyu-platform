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
  DynamoDBProfileRepository,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { learnAllUserActivities } from '../usecases/learn-user-activity.usecase.js';

const SERVICE_ID = 'livetalk';

export const handler = createScheduledHandler<ScheduledEvent, HandlerResponse>(
  {
    serviceId: SERVICE_ID,
    name: 'learn-user-activity',
    errorTitle: 'ユーザー活動時間学習バッチ: 致命的エラー',
  },
  async (event) => {
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
  }
);
