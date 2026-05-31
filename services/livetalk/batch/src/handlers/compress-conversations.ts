import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBCharacterStateRepository,
  DynamoDBInterestRepository,
  DynamoDBMemorySummaryRepository,
  DynamoDBMessageRepository,
  DynamoDBMemoryRepository,
  EmbeddingMemoryRepository,
  OpenAIClient,
  OpenAIEmbeddingClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { compressAllConversations } from '../usecases/compress-conversations.usecase.js';

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
  logger.info('[compress-conversations] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const summaryRepo = new DynamoDBMemorySummaryRepository(docClient, tableName);
    const messageRepo = new DynamoDBMessageRepository(docClient, tableName, defaultUlidFactory);
    const innerMemoryRepo = new DynamoDBMemoryRepository(docClient, tableName, defaultUlidFactory);
    const embeddingClient = new OpenAIEmbeddingClient({ apiKey });
    const memoryRepo = new EmbeddingMemoryRepository(innerMemoryRepo, embeddingClient);
    const llmClient = new OpenAIClient({ apiKey });
    const interestRepo = new DynamoDBInterestRepository(docClient, tableName);
    const characterStateRepo = new DynamoDBCharacterStateRepository(docClient, tableName);

    const result = await compressAllConversations({
      docClient,
      tableName,
      summaryRepo,
      messageRepo,
      memoryRepo,
      llmClient,
      interestRepo,
      characterStateRepo,
    });

    logger.info('[compress-conversations] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '圧縮要約バッチが正常に完了しました',
        ...result,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('[compress-conversations] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity: 'error',
      title: '圧縮要約バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '圧縮要約バッチでエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
