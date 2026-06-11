import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateProfileInput,
  ProfileEntity,
  ProfileKey,
  UpdateProfileInput,
} from '../entities/profile.entity.js';
import { buildProfileGSI1PK } from '../mappers/keys.js';
import { ProfileMapper } from '../mappers/profile.mapper.js';
import type { ProfileRepository } from './profile.repository.interface.js';

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly mapper: ProfileMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new ProfileMapper();
  }

  public async getById(key: ProfileKey): Promise<ProfileEntity | null> {
    const { pk, sk } = this.mapper.buildKeys(key);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async listAllUserIds(): Promise<string[]> {
    const userIds: string[] = [];
    let cursor: string | undefined;

    do {
      const result = this.store.queryByAttribute(
        { attributeName: 'GSI1PK', attributeValue: buildProfileGSI1PK() },
        cursor ? { cursor } : undefined
      );
      for (const item of result.items) {
        if (typeof item.GSI1SK === 'string' && item.GSI1SK) {
          userIds.push(item.GSI1SK);
        }
      }
      cursor = result.nextCursor;
    } while (cursor !== undefined);

    return userIds;
  }

  public async upsert(
    input: CreateProfileInput,
    updates: UpdateProfileInput = {}
  ): Promise<ProfileEntity> {
    const now = this.nowMs();
    const existing = await this.getById({ userId: input.UserID });
    const merged: ProfileEntity = {
      UserID: input.UserID,
      LastActiveAt: updates.LastActiveAt ?? input.LastActiveAt ?? now,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
      ...(updates.Consents !== undefined
        ? { Consents: { ...existing?.Consents, ...updates.Consents } }
        : existing?.Consents !== undefined
          ? { Consents: existing.Consents }
          : {}),
    };
    this.store.put(this.mapper.toItem(merged));
    return merged;
  }
}
