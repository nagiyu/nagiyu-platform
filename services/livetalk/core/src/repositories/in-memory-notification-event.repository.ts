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
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<NotificationEventEntity, NotificationEventKey>;

  constructor(store: InMemorySingleTableStore, nowMs: () => number = () => Date.now()) {
    this.store = store;
    this.nowMs = nowMs;
    this.mapper = new NotificationEventMapper();
    this.entityStore = new InMemoryEntityStore(store, this.mapper, { now: nowMs });
  }

  public async put(input: CreateNotificationEventInput): Promise<NotificationEventEntity> {
    const now = this.nowMs();
    return this.entityStore.put({ ...input, createdAt: now, updatedAt: now });
  }

  public async listByUser(userId: string, limit = 100): Promise<NotificationEventEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNotifSKPrefix();
    const result = this.store.query({ pk, sk: { operator: 'begins_with', value: prefix } });
    return result.items
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
    // limit を指定しないとデフォルト 100 件で打ち切られるため、十分大きな値を渡す
    const result = this.store.query(
      { pk, sk: { operator: 'begins_with', value: prefix } },
      { limit: Number.MAX_SAFE_INTEGER }
    );
    const sorted = result.items
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
