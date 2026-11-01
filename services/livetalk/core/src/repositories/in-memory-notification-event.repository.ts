import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  CreateNotificationEventInput,
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';
import { NotificationEventMapper } from '../mappers/notification-event.mapper.js';
import { buildNotifSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NotificationEventRepository } from './notification-event.repository.interface.js';

export class InMemoryNotificationEventRepository implements NotificationEventRepository {
  private readonly mapper: NotificationEventMapper;
  private readonly store: InMemorySingleTableStore;
  private readonly entityStore: EntityStore<NotificationEventEntity, NotificationEventKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.mapper = new NotificationEventMapper();
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreateNotificationEventInput): Promise<NotificationEventEntity> {
    return this.entityStore.put({ ...input, createdAt: undefined });
  }

  public async listByUser(userId: string, limit = 100): Promise<NotificationEventEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNotifSKPrefix();
    // 全件取得して CreatedAt 降順に並べてから limit を適用する (最新のものを落とさないため)
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    return items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  public async listLatestUnconsumedByCharacter(
    userId: string,
    characterIds: string[]
  ): Promise<NotificationEventEntity[]> {
    if (characterIds.length === 0) return [];

    const pk = buildUserPK(userId);
    const prefix = buildNotifSKPrefix();
    const items = this.store.queryAll({ pk, sk: { operator: 'begins_with', value: prefix } });
    const sorted = items
      .map((item) => this.mapper.toEntity(item))
      .sort((a, b) => b.createdAt - a.createdAt);

    const target = new Set(characterIds);
    const map = new Map<string, NotificationEventEntity>();
    for (const entity of sorted) {
      if (
        target.has(entity.characterId) &&
        entity.consumedAt === undefined &&
        !map.has(entity.characterId)
      ) {
        map.set(entity.characterId, entity);
      }
    }

    return Array.from(map.values());
  }

  public async get(key: NotificationEventKey): Promise<NotificationEventEntity | null> {
    return this.entityStore.get(key);
  }

  public async markConsumed(key: NotificationEventKey, consumedAt: number): Promise<void> {
    await this.entityStore.update(key, { consumedAt });
  }
}
