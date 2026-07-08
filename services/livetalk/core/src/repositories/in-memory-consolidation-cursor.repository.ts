import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  ConsolidationCursorEntity,
  PutConsolidationCursorInput,
} from '../entities/consolidation-cursor.entity.js';
import { ConsolidationCursorMapper } from '../mappers/consolidation-cursor.mapper.js';
import { OptimisticLockError } from './optimistic-lock.error.js';
import type { ConsolidationCursorRepository } from './consolidation-cursor.repository.interface.js';

export class InMemoryConsolidationCursorRepository implements ConsolidationCursorRepository {
  private readonly mapper: ConsolidationCursorMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new ConsolidationCursorMapper();
  }

  public async get(userId: string, characterId: string): Promise<ConsolidationCursorEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, characterId });
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async put(
    entity: PutConsolidationCursorInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<ConsolidationCursorEntity> {
    const now = this.nowMs();
    const { pk, sk } = this.mapper.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
    });
    const existingItem = this.store.get(pk, sk);
    const identifier = `${entity.UserID}#${entity.CharacterID}`;

    if (opts.expectedUpdatedAt === undefined) {
      if (existingItem) {
        throw new OptimisticLockError('ConsolidationCursor', identifier);
      }
    } else {
      const existingUpdatedAt = existingItem
        ? this.mapper.toEntity(existingItem).UpdatedAt
        : undefined;
      if (existingUpdatedAt !== opts.expectedUpdatedAt) {
        throw new OptimisticLockError('ConsolidationCursor', identifier);
      }
    }

    const merged: ConsolidationCursorEntity = { ...entity, UpdatedAt: now };
    this.store.put(this.mapper.toItem(merged));
    return merged;
  }
}
