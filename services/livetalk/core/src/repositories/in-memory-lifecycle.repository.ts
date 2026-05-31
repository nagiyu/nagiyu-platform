import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateLifecycleInput,
  LifecycleEntity,
  LifecycleKey,
  UpdateLifecycleInput,
} from '../entities/lifecycle.entity.js';
import { LifecycleMapper } from '../mappers/lifecycle.mapper.js';
import type { LifecycleRepository } from './lifecycle.repository.interface.js';

export class InMemoryLifecycleRepository implements LifecycleRepository {
  private readonly mapper: LifecycleMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new LifecycleMapper();
  }

  public async get(key: LifecycleKey): Promise<LifecycleEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async upsert(
    input: CreateLifecycleInput,
    updates: UpdateLifecycleInput = {}
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get({ userId: input.UserID, characterId: input.CharacterID });
    const entity: LifecycleEntity = {
      UserID: input.UserID,
      CharacterID: input.CharacterID,
      Bedtime: updates.Bedtime ?? input.Bedtime,
      WakeUpTime: updates.WakeUpTime ?? input.WakeUpTime,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
    };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }
}
