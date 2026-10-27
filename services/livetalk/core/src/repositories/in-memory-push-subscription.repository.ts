import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { PushSubscriptionMapper } from '../mappers/push-subscription.mapper.js';
import { buildPushSubscriptionSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { PushSubscriptionRepository } from './push-subscription.repository.interface.js';

export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper = new PushSubscriptionMapper();
  private readonly store: InMemorySingleTableStore;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<PushSubscriptionEntity, PushSubscriptionKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreatePushSubscriptionInput): Promise<PushSubscriptionEntity> {
    const now = this.nowMs();
    return this.entityStore.put({ ...input, createdAt: now, updatedAt: now });
  }

  public async get(key: PushSubscriptionKey): Promise<PushSubscriptionEntity | null> {
    return this.entityStore.get(key);
  }

  /** 無効な endpoint の片付けから呼ばれるため、対象がなくても成功させる。 */
  public async delete(key: PushSubscriptionKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }

  public async listByUser(userId: string): Promise<PushSubscriptionEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildPushSubscriptionSKPrefix();
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    return result.items.map((item) => this.mapper.toEntity(item));
  }
}
