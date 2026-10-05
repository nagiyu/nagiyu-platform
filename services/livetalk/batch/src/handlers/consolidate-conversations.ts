import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  ScheduledHandlerError,
  type HandlerResponse,
  type ScheduledEvent,
} from '@nagiyu/aws';
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
import { consolidateAllConversations } from '../usecases/consolidate-conversations.usecase.js';

const SERVICE_ID = 'livetalk';

export const handler = createScheduledHandler<ScheduledEvent, HandlerResponse>(
  {
    serviceId: SERVICE_ID,
    name: 'consolidate-conversations',
    errorTitle: '集約バッチ: 致命的エラー',
  },
  async (event) => {
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

    const result = await consolidateAllConversations({
      profileRepo,
      topicRepo,
      messageRepo,
      webRawRepo,
      cursorRepo,
      noteRepo,
      llmClient,
      embeddingClient,
    });

    logger.info('[consolidate-conversations] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    if (result.failedUsers > 0) {
      // 部分失敗も例外にして Lambda を失敗させる。報告のタイトルと失敗 ID は例外に持たせ、
      // 骨格が 1 回だけ報告する。
      const message = `集約バッチで ${result.failedUsers} 件のユーザー処理が失敗しました`;
      logger.error('[consolidate-conversations] 部分失敗', {
        eventId: event.id,
        failedUsers: result.failedUsers,
        failedUserIds: result.failedUserIds,
      });
      throw new ScheduledHandlerError(message, {
        title: '集約バッチ: 部分失敗',
        context: { failedUserIds: result.failedUserIds },
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '集約バッチが正常に完了しました',
        ...result,
      }),
    };
  }
);
