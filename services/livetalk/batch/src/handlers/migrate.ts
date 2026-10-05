/**
 * 旧知識資材（Memory / Knowledge / InterestCategory）→ 新 Topic モデルへの
 * 一回性マイグレーション Lambda ハンドラ（手動 invoke 専用、throwaway コード）。
 *
 * EventBridge スケジュールは付けない。ペイロード（`MigratePayload`）をそのまま
 * Lambda イベントとして受け取る。
 *
 * 移行完了・Issue クローズ後は本ファイルを削除してよい。
 */
import { logger } from '@nagiyu/common';
import {
  createScheduledHandler,
  getDynamoDBDocumentClient,
  getTableName,
  type HandlerResponse,
} from '@nagiyu/aws';
import {
  DynamoDBTopicRepository,
  DynamoDBProfileRepository,
  OpenAIClient,
  OpenAIEmbeddingClient,
  defaultUlidFactory,
} from '@nagiyu/livetalk-core';
import { runMigration, type MigratePayload } from '../usecases/migrate.usecase.js';

const SERVICE_ID = 'livetalk';

/**
 * 手動 invoke 専用のハンドラ。Lambda イベント（＝`MigratePayload`）をそのまま usecase に渡す。
 * EventBridge 由来の id / time が無いため、ログ context にはペイロードの実行条件を載せる。
 */
export const handler = createScheduledHandler<MigratePayload, HandlerResponse>(
  {
    serviceId: SERVICE_ID,
    name: 'migrate',
    errorTitle: '一回性移行バッチ: 致命的エラー',
    getLogContext: (event) => ({
      eventId: `migrate-${Date.now()}`,
      targetUserId: event.targetUserId,
      characterId: event.characterId,
      dryRun: event.dryRun,
      migrate: event.migrate,
      chunkStart: event.chunkStart,
      chunkEnd: event.chunkEnd,
      wipeNewFirst: event.wipeNewFirst,
      wipeNewCreatedAfter: event.wipeNewCreatedAfter,
      deleteOldAfter: event.deleteOldAfter,
    }),
  },
  async (event) => {
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const topicRepo = new DynamoDBTopicRepository(docClient, tableName, defaultUlidFactory);
    const profileRepo = new DynamoDBProfileRepository(docClient, tableName);
    const llmClient = new OpenAIClient({ apiKey });
    const embeddingClient = new OpenAIEmbeddingClient({ apiKey });

    const result = await runMigration({
      payload: event,
      profileRepo,
      docClient,
      tableName,
      topicRepo,
      llmClient,
      embeddingClient,
      ulidFactory: defaultUlidFactory,
    });

    logger.info('[migrate] バッチ完了', { ...result, scopeReports: undefined });

    if (result.failedScopes > 0) {
      // 部分失敗も例外にして Lambda を失敗させ、再実行判断は人が行う。
      // エラー報告は骨格が行うため、失敗スコープのキーはここでログに残す。
      const message = `一回性移行バッチで ${result.failedScopes} 件のスコープ処理が失敗しました`;
      logger.error('[migrate] 部分失敗', {
        failedScopes: result.failedScopes,
        failedScopeKeys: result.failedScopeKeys,
      });
      throw new Error(message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: '一回性移行バッチが正常に完了しました',
        ...result,
      }),
    };
  }
);
