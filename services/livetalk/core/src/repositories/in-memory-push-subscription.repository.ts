import { InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { PushSubscriptionMapper } from '../mappers/push-subscription.mapper.js';
import {
  buildPushSubscriptionSK,
  buildPushSubscriptionSKPrefix,
  buildUserPK,
} from '../mappers/keys.js';
import type { PushSubscriptionRepository } from './push-subscription.repository.interface.js';

export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper: PushSubscriptionMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new PushSubscriptionMapper();
  }

  public async put(input: CreatePushSubscriptionInput): Promise<PushSubscriptionEntity> {
    const now = this.nowMs();
    const entity: PushSubscriptionEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    this.store.put(this.mapper.toItem(entity));
    return entity;
  }

  public async listByUser(userId: string): Promise<PushSubscriptionEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildPushSubscriptionSKPrefix();
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    return result.items.map((item) => this.mapper.toEntity(item));
  }

  public async get(key: PushSubscriptionKey): Promise<PushSubscriptionEntity | null> {
    const pk = buildUserPK(key.userId);
    const sk = buildPushSubscriptionSK(key.subscriptionId);
    const item = this.store.get(pk, sk);
    if (!item) return null;
    return this.mapper.toEntity(item);
  }

  public async delete(key: PushSubscriptionKey): Promise<void> {
    const pk = buildUserPK(key.userId);
    const sk = buildPushSubscriptionSK(key.subscriptionId);
    this.store.delete(pk, sk);
  }
}
