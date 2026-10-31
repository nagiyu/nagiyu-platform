import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, type EntityStore } from '@nagiyu/aws';
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

export class DynamoDBLifecycleRepository implements LifecycleRepository {
  private readonly entityStore: EntityStore<LifecycleEntity, LifecycleKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, new LifecycleMapper(), {
      now: nowMs,
    });
  }

  public async get(key: LifecycleKey): Promise<LifecycleEntity | null> {
    return this.entityStore.get(key);
  }

  public async upsert(
    input: CreateLifecycleInput,
    updates: UpdateLifecycleInput = {}
  ): Promise<LifecycleEntity> {
    const existing = await this.get({ userId: input.userId, characterId: input.characterId });
    return this.entityStore.put({
      userId: input.userId,
      characterId: input.characterId,
      bedtime: updates.bedtime ?? input.bedtime,
      wakeUpTime: updates.wakeUpTime ?? input.wakeUpTime,
      ...(existing?.userActivityProfile !== undefined && {
        userActivityProfile: existing.userActivityProfile,
      }),
      createdAt: existing?.createdAt,
    });
  }

  public async updateUserActivityProfile(
    key: LifecycleKey,
    profile: UserActivityProfile
  ): Promise<LifecycleEntity> {
    const existing = await this.get(key);
    return this.entityStore.put({
      userId: key.userId,
      characterId: key.characterId,
      bedtime: existing?.bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
      wakeUpTime: existing?.wakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME,
      userActivityProfile: profile,
      createdAt: existing?.createdAt,
    });
  }

  public async updateSchedule(
    key: LifecycleKey,
    schedule: { bedtime: string; wakeUpTime: string }
  ): Promise<LifecycleEntity> {
    const existing = await this.get(key);
    return this.entityStore.put({
      userId: key.userId,
      characterId: key.characterId,
      bedtime: schedule.bedtime,
      wakeUpTime: schedule.wakeUpTime,
      ...(existing?.userActivityProfile !== undefined && {
        userActivityProfile: existing.userActivityProfile,
      }),
      createdAt: existing?.createdAt,
    });
  }
}
