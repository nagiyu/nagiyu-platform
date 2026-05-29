import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateMemorySummaryInput,
  MemorySummaryEntity,
} from '../entities/memory-summary.entity.js';
import { MemorySummaryMapper } from '../mappers/memory-summary.mapper.js';
import type { MemorySummaryRepository } from './memory-summary.repository.interface.js';

export class InMemoryMemorySummaryRepository implements MemorySummaryRepository {
  private readonly mapper: MemorySummaryMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(
    store: InMemorySingleTableStore,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new MemorySummaryMapper();
  }

  public async get(userId: string, characterId: string): Promise<MemorySummaryEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, characterId });
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async put(input: CreateMemorySummaryInput): Promise<MemorySummaryEntity> {
    const now = this.nowMs();
    const { pk, sk } = this.mapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
    });
    const existing = this.store.get(pk, sk);
    const createdAt = existing ? (existing.CreatedAt as number) : now;

    const entity: MemorySummaryEntity = {
      ...input,
      CreatedAt: createdAt,
      UpdatedAt: now,
    };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }
}
