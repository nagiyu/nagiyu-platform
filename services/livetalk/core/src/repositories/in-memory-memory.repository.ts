import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import { MEMORY_TIER_C_TTL_SECONDS, MEMORY_TIER_D_TTL_SECONDS } from '../constants.js';
import type {
  CreateMemoryInput,
  MemoryEntity,
  MemoryKey,
  Tier,
  UpdateMemoryInput,
} from '../entities/memory.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { MemoryMapper } from '../mappers/memory.mapper.js';
import {
  buildMemoryAllTiersSKPrefix,
  buildMemoryTierSKPrefix,
  buildUserPK,
} from '../mappers/keys.js';
import type { MemoryRepository } from './memory.repository.interface.js';

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly mapper: MemoryMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowIso: () => string;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowIso: () => string = () => new Date().toISOString()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowIso = nowIso;
    this.mapper = new MemoryMapper();
  }

  public async put(input: CreateMemoryInput): Promise<MemoryEntity> {
    const now = this.nowIso();
    const memoryId = input.MemoryID ?? this.ulidFactory();

    const entity: MemoryEntity = {
      ...input,
      MemoryID: memoryId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const baseItem = this.mapper.toItem(entity);
    const item: DynamoDBItem = { ...baseItem };

    const ttlSec = this.resolveTtlSec(entity.Tier);
    if (ttlSec !== null) {
      item.TTL = Math.floor(Date.now() / 1000) + ttlSec;
    }

    this.store.put(item);
    return entity;
  }

  public async get(key: MemoryKey): Promise<MemoryEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async listByTier(userId: string, characterId: string, tier: Tier): Promise<MemoryEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildMemoryTierSKPrefix(characterId, tier);
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    return items.map((item) => this.mapper.toEntity(item));
  }

  public async listByCategory(userId: string, characterId: string, category: string): Promise<MemoryEntity[]> {
    const pk = buildUserPK(userId);
    const allPrefix = buildMemoryAllTiersSKPrefix(characterId);
    const { items } = this.store.query(
      { pk, sk: { operator: 'begins_with', value: allPrefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    const result: MemoryEntity[] = [];
    for (const item of items) {
      let entity: MemoryEntity;
      try {
        entity = this.mapper.toEntity(item);
      } catch {
        continue;
      }
      if (entity.Category === category) {
        result.push(entity);
      }
    }
    return result;
  }

  public async update(input: UpdateMemoryInput): Promise<MemoryEntity> {
    const { pk, sk } = this.mapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
      tier: input.Tier,
      category: input.Category,
      memoryId: input.MemoryID,
    });
    const existing = this.store.get(pk, sk);
    if (!existing) {
      throw new Error(`メモリが見つかりません: ${pk}#${sk}`);
    }
    const current = this.mapper.toEntity(existing);
    const updated: MemoryEntity = {
      ...current,
      ...(input.Content !== undefined && { Content: input.Content }),
      ...(input.Confidence !== undefined && { Confidence: input.Confidence }),
      ...(input.ReferencedCount !== undefined && { ReferencedCount: input.ReferencedCount }),
      ...(input.LastReferencedAt !== undefined && { LastReferencedAt: input.LastReferencedAt }),
      ...(input.Embedding !== undefined && { Embedding: input.Embedding }),
      UpdatedAt: this.nowIso(),
    };
    this.store.put(this.mapper.toItem(updated));
    return updated;
  }

  public async delete(key: MemoryKey): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys(key);
    this.store.delete(pk, sk);
  }

  public async promote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    return this.changeTier(memory, toTier);
  }

  public async demote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    return this.changeTier(memory, toTier);
  }

  private changeTier(memory: MemoryEntity, toTier: Tier): MemoryEntity {
    const oldPk = buildUserPK(memory.UserID);
    const { sk: oldSk } = this.mapper.buildKeys({
      userId: memory.UserID,
      characterId: memory.CharacterID,
      tier: memory.Tier,
      category: memory.Category,
      memoryId: memory.MemoryID,
    });

    const now = this.nowIso();
    const newEntity: MemoryEntity = { ...memory, Tier: toTier, UpdatedAt: now };
    const newItem: DynamoDBItem = { ...this.mapper.toItem(newEntity) };

    const ttlSec = this.resolveTtlSec(toTier);
    if (ttlSec !== null) {
      newItem.TTL = Math.floor(Date.now() / 1000) + ttlSec;
    }

    this.store.put(newItem);
    this.store.delete(oldPk, oldSk);
    return newEntity;
  }

  private resolveTtlSec(tier: Tier): number | null {
    if (tier === 'C') return MEMORY_TIER_C_TTL_SECONDS;
    if (tier === 'D') return MEMORY_TIER_D_TTL_SECONDS;
    return null;
  }
}
