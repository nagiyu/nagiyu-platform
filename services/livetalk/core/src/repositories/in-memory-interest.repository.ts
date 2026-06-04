import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateInterestCategoryInput,
  InterestCategoryEntity,
  InterestCategoryKey,
} from '../entities/interest-category.entity.js';
import { InterestCategoryMapper } from '../mappers/interest-category.mapper.js';
import { buildInterestSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { InterestRepository } from './interest.repository.interface.js';

export class InMemoryInterestRepository implements InterestRepository {
  private readonly mapper: InterestCategoryMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new InterestCategoryMapper();
  }

  public async get(
    userId: string,
    characterId: string,
    category: string
  ): Promise<InterestCategoryEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ userId, characterId, category });
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async list(userId: string, characterId: string): Promise<InterestCategoryEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildInterestSKPrefix(characterId);
    const result = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: 1000 }
    );
    return result.items.map((item) => this.mapper.toEntity(item));
  }

  public async put(input: CreateInterestCategoryInput): Promise<InterestCategoryEntity> {
    const now = this.nowMs();
    const { pk, sk } = this.mapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
      category: input.Category,
    });
    const existing = this.store.get(pk, sk);
    const entity: InterestCategoryEntity = {
      ...input,
      CreatedAt: existing ? (existing.CreatedAt as number) : now,
      UpdatedAt: now,
    };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async update(entity: InterestCategoryEntity): Promise<InterestCategoryEntity> {
    const now = this.nowMs();
    const updated: InterestCategoryEntity = { ...entity, UpdatedAt: now };
    this.store.put(this.mapper.toItem(updated));
    return updated;
  }

  public async delete(key: InterestCategoryKey): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys(key);
    this.store.delete(pk, sk);
  }
}
