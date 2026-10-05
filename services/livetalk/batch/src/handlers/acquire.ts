import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  type HandlerResponse,
  type ScheduledEvent,
} from '@nagiyu/aws';
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
import { acquireAllUsers } from '../usecases/acquire.usecase.js';

const SERVICE_ID = 'livetalk';

export const handler = createScheduledHandler<ScheduledEvent, HandlerResponse>(
  { serviceId: SERVICE_ID, name: 'acquire', errorTitle: 'acquire バッチ: 致命的エラー' },
  async (event) => {
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

    const result = await acquireAllUsers({
      profileRepo,
      lifecycleRepo,
      topicRepo,
      webRawRepo,
      studyTopicRepo,
      researchClient,
      changeDetector,
      ulidFactory: defaultUlidFactory,
    });

    logger.info('[acquire] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    if (result.failedUsers > 0) {
      // 部分失敗も例外にして Lambda を失敗させる。エラー報告は骨格が行うため、
      // 失敗したユーザー ID はここでログに残す。
      const message = `acquire バッチで ${result.failedUsers} 件のユーザー処理が失敗しました`;
      logger.error('[acquire] 部分失敗', {
        eventId: event.id,
        failedUsers: result.failedUsers,
        failedUserIds: result.failedUserIds,
      });
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
);
