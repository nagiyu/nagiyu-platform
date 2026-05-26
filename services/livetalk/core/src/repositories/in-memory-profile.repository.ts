import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateProfileInput,
  ProfileEntity,
  ProfileKey,
  UpdateProfileInput,
} from '../entities/profile.entity.js';
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
    };
    this.store.put(this.mapper.toItem(merged));
    return merged;
  }
}
