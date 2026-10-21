import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  EntityAlreadyExistsError,
  OptimisticLockError,
  type EntityStore,
} from '@nagiyu/aws';
import type {
  ConsolidationCursorEntity,
  ConsolidationCursorKey,
  PutConsolidationCursorInput,
} from '../entities/consolidation-cursor.entity.js';
import { ConsolidationCursorMapper } from '../mappers/consolidation-cursor.mapper.js';
import type { ConsolidationCursorRepository } from './consolidation-cursor.repository.interface.js';

/**
 * 集約（consolidation）カーソルリポジトリの DynamoDB 実装。
 */
export class DynamoDBConsolidationCursorRepository implements ConsolidationCursorRepository {
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<ConsolidationCursorEntity, ConsolidationCursorKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.nowMs = nowMs;
    this.entityStore = new DynamoDBEntityStore(
      docClient,
      tableName,
      new ConsolidationCursorMapper(),
      { now: nowMs }
    );
  }

  public async get(userId: string, characterId: string): Promise<ConsolidationCursorEntity | null> {
    return this.entityStore.get({ userId, characterId });
  }

  public async put(
    entity: PutConsolidationCursorInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<ConsolidationCursorEntity> {
    const merged: ConsolidationCursorEntity = { ...entity, updatedAt: this.nowMs() };

    if (opts.expectedUpdatedAt !== undefined) {
      return this.entityStore.put(merged, { expectedUpdatedAt: opts.expectedUpdatedAt });
    }

    try {
      return await this.entityStore.create(merged);
    } catch (error) {
      // 新規作成の衝突も呼び出し側が楽観ロック競合として扱えるよう、同じエラーに揃える
      if (error instanceof EntityAlreadyExistsError) {
        throw new OptimisticLockError(
          'ConsolidationCursor',
          `${entity.userId}#${entity.characterId}`
        );
      }
      throw error;
    }
  }
}
