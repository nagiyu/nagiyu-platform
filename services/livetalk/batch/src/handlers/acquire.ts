import { logger } from '@nagiyu/common';
import {
  createAuthUserRoleSourceReader,
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  ScheduledHandlerError,
  type HandlerResponse,
  type ScheduledEvent,
} from '@nagiyu/aws';
import {
  createTopicRepository,
  createWebRawRepository,
  createStudyTopicRepository,
  createFreshnessCheckRequestRepository,
  createExplorationRepository,
  createLifecycleRepository,
  createMessageRepository,
  createStudyUsageRepository,
  createProfileRepository,
  OpenAIResearchClient,
  OpenAIClient,
  LLMWebFactChangeDetector,
  LLMExplorationAngleGenerator,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { acquireAllUsers } from '../usecases/acquire.usecase.js';

const SERVICE_ID = 'livetalk';

export const ACQUIRE_HANDLER_ERROR_MESSAGES = {
  AUTH_USERS_TABLE_NAME_MISSING:
    '環境変数 AUTH_USERS_TABLE_NAME が設定されていません (利用者の区分を判定できないため勉強を実行しません)',
} as const;

export const handler = createScheduledHandler<ScheduledEvent, HandlerResponse>(
  { serviceId: SERVICE_ID, name: 'acquire', errorTitle: 'acquire バッチ: 致命的エラー' },
  async (event) => {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    // 区分を判定できないまま勉強すると原価の上限を守れないため、未設定は起動時に失敗させる
    const authUsersTableName = process.env.AUTH_USERS_TABLE_NAME;
    if (!authUsersTableName) {
      throw new Error(ACQUIRE_HANDLER_ERROR_MESSAGES.AUTH_USERS_TABLE_NAME_MISSING);
    }
    const authUserRoleSourceReader = createAuthUserRoleSourceReader(authUsersTableName, docClient);

    const topicRepo = createTopicRepository(docClient, tableName);
    const webRawRepo = createWebRawRepository(docClient, tableName);
    const studyTopicRepo = createStudyTopicRepository(docClient, tableName);
    const freshnessCheckRequestRepo = createFreshnessCheckRequestRepository(docClient, tableName);
    const explorationRepo = createExplorationRepository(docClient, tableName);
    const studyUsageRepo = createStudyUsageRepository(docClient, tableName);
    const lifecycleRepo = createLifecycleRepository(docClient, tableName);
    const messageRepo = createMessageRepository(docClient, tableName);
    const profileRepo = createProfileRepository(docClient, tableName);
    const researchClient = new OpenAIResearchClient({ apiKey });
    const llmClient = new OpenAIClient({ apiKey });
    const changeDetector = new LLMWebFactChangeDetector(llmClient);
    const angleGenerator = new LLMExplorationAngleGenerator(llmClient);

    const result = await acquireAllUsers({
      profileRepo,
      authUserRoleSourceReader,
      lifecycleRepo,
      messageRepo,
      topicRepo,
      webRawRepo,
      studyTopicRepo,
      freshnessCheckRequestRepo,
      studyUsageRepo,
      researchClient,
      changeDetector,
      angleGenerator,
      explorationRepo,
      ulidFactory: defaultUlidFactory,
    });

    // dev で区分どおりに動いたかをログで確かめられるよう、結果の tierUsers もそのまま出す
    logger.info('[acquire] バッチ完了', {
      eventId: event.id,
      ...result,
    });

    if (result.failedUsers > 0) {
      // 部分失敗も例外にして Lambda を失敗させる。報告のタイトルと失敗 ID は例外に持たせ、
      // 骨格が 1 回だけ報告する。
      const message = `acquire バッチで ${result.failedUsers} 件のユーザー処理が失敗しました`;
      logger.error('[acquire] 部分失敗', {
        eventId: event.id,
        failedUsers: result.failedUsers,
        failedUserIds: result.failedUserIds,
      });
      throw new ScheduledHandlerError(message, {
        title: 'acquire バッチ: 部分失敗',
        context: { failedUserIds: result.failedUserIds },
      });
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
