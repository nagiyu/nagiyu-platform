import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateProfileInput,
  ProfileEntity,
  ProfileKey,
  UpdateProfileInput,
} from '../entities/profile.entity.js';
import { buildProfileGSI1PK, PROFILE_GSI_PROJECTION } from '../mappers/keys.js';
import { ProfileMapper } from '../mappers/profile.mapper.js';
import type { ProfileRepository } from './profile.repository.interface.js';

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<ProfileEntity, ProfileKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, new ProfileMapper(), { now: nowMs });
  }

  public async getById(key: ProfileKey): Promise<ProfileEntity | null> {
    return this.entityStore.get(key);
  }

  public async listAllUserIds(): Promise<string[]> {
    const items = this.store.queryAllByAttribute({
      attributeName: 'GSI1PK',
      attributeValue: buildProfileGSI1PK(),
      projection: PROFILE_GSI_PROJECTION,
      // sk 条件を指定しないため、実 DynamoDB の GSI1 Query と同様に GSI1SK 昇順で返すよう明示する
      // (listAllUserIds は順序を約束しないため呼び出し側の挙動には影響しない)
      gsiSortKeyAttributeName: 'GSI1SK',
    });
    const userIds: string[] = [];
    for (const item of items) {
      if (typeof item.GSI1SK === 'string' && item.GSI1SK) {
        userIds.push(item.GSI1SK);
      }
    }
    return userIds;
  }

  public async upsert(
    input: CreateProfileInput,
    updates: UpdateProfileInput = {}
  ): Promise<ProfileEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId: input.userId });

    const merged: ProfileEntity = {
      userId: input.userId,
      lastActiveAt: updates.lastActiveAt ?? input.lastActiveAt ?? now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(updates.consents !== undefined
        ? { consents: { ...existing?.consents, ...updates.consents } }
        : existing?.consents !== undefined
          ? { consents: existing.consents }
          : {}),
    };
    return this.entityStore.put(merged);
  }
}
