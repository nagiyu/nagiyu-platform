import { logger, toErrorMessage } from '@nagiyu/common';
import { getDynamoDBDocumentClient, getTableName, reportErrorEvent } from '@nagiyu/aws';
import {
  DynamoDBInterestRepository,
  DynamoDBKnowledgeRepository,
  DynamoDBLifecycleRepository,
  OpenAIResearchClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { studyAllUsers } from '../usecases/study.usecase.js';

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
  logger.info('[study] バッチ開始', {
    eventId: event.id,
    eventTime: event.time,
  });

  try {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const lifecycleRepo = new DynamoDBLifecycleRepository(docClient, tableName);
    const interestRepo = new DynamoDBInterestRepository(docClient, tableName);
    const knowledgeRepo = new DynamoDBKnowledgeRepository(docClient, tableName);
    const researchClient = new OpenAIResearchClient({ apiKey });

    const result = await studyAllUsers({
      docClient,
      tableName,
      lifecycleRepo,
      interestRepo,
      knowledgeRepo,
      researchClient,
      ulidFactory: defaultUlidFactory,
    });

    logger.info('[study] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '勉強バッチが正常に完了しました',
        ...result,
      }),
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.error('[study] バッチ失敗', {
      eventId: event.id,
      error: errorMessage,
    });
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity: 'error',
      title: '勉強バッチ: 致命的エラー',
      message: errorMessage,
      context: { eventId: event.id },
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: '勉強バッチでエラーが発生しました',
        error: errorMessage,
      }),
    };
  }
}
