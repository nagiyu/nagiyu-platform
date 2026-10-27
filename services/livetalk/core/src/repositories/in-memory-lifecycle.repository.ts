import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateLifecycleInput,
  LifecycleEntity,
  LifecycleKey,
  UpdateLifecycleInput,
  UserActivityProfile,
} from '../entities/lifecycle.entity.js';
import { LIFECYCLE_DEFAULT_BEDTIME, LIFECYCLE_DEFAULT_WAKE_UP_TIME } from '../constants.js';
import { LifecycleMapper } from '../mappers/lifecycle.mapper.js';
import type { LifecycleRepository } from './lifecycle.repository.interface.js';

export class InMemoryLifecycleRepository implements LifecycleRepository {
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<LifecycleEntity, LifecycleKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, new LifecycleMapper(), { now: nowMs });
  }

  public async get(key: LifecycleKey): Promise<LifecycleEntity | null> {
    return this.entityStore.get(key);
  }

  public async upsert(
    input: CreateLifecycleInput,
    updates: UpdateLifecycleInput = {}
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get({ userId: input.userId, characterId: input.characterId });
    return this.entityStore.put({
      userId: input.userId,
      characterId: input.characterId,
      bedtime: updates.bedtime ?? input.bedtime,
      wakeUpTime: updates.wakeUpTime ?? input.wakeUpTime,
      ...(existing?.userActivityProfile !== undefined && {
        userActivityProfile: existing.userActivityProfile,
      }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  public async updateUserActivityProfile(
    key: LifecycleKey,
    profile: UserActivityProfile
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get(key);
    return this.entityStore.put({
      userId: key.userId,
      characterId: key.characterId,
      bedtime: existing?.bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
      wakeUpTime: existing?.wakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME,
      userActivityProfile: profile,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  public async updateSchedule(
    key: LifecycleKey,
    schedule: { bedtime: string; wakeUpTime: string }
  ): Promise<LifecycleEntity> {
    const now = this.nowMs();
    const existing = await this.get(key);
    return this.entityStore.put({
      userId: key.userId,
      characterId: key.characterId,
      bedtime: schedule.bedtime,
      wakeUpTime: schedule.wakeUpTime,
      ...(existing?.userActivityProfile !== undefined && {
        userActivityProfile: existing.userActivityProfile,
      }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}
