import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryPages, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  CreateNotificationEventInput,
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';
import { NotificationEventMapper } from '../mappers/notification-event.mapper.js';
import { buildNotifSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { NotificationEventRepository } from './notification-event.repository.interface.js';

export class DynamoDBNotificationEventRepository implements NotificationEventRepository {
  private readonly mapper: NotificationEventMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<NotificationEventEntity, NotificationEventKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new NotificationEventMapper();
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: CreateNotificationEventInput): Promise<NotificationEventEntity> {
    return this.entityStore.put({ ...input, createdAt: undefined });
  }

  public async listByUser(userId: string, limit = 100): Promise<NotificationEventEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildNotifSKPrefix();
    const results: NotificationEventEntity[] = [];

    try {
      for await (const page of queryPages(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
        ScanIndexForward: false,
        Limit: limit,
      })) {
        // Limit はページ単位の上限にすぎず、1MB 上限で 1 ページ目が limit 未満になると
        // 次ページへ進むため、件数はアイテム単位で打ち切る。
        for (const raw of page) {
          results.push(this.mapper.toEntity(raw));
          if (results.length >= limit) return results;
        }
      }
    } catch (error) {
      throw toDatabaseError(error);
    }

    return results;
  }

  public async listLatestUnconsumedByCharacter(
    userId: string,
    characterIds: string[]
  ): Promise<NotificationEventEntity[]> {
    if (characterIds.length === 0) return [];

    const pk = buildUserPK(userId);
    const prefix = buildNotifSKPrefix();
    const target = new Set(characterIds);
    const map = new Map<string, NotificationEventEntity>();

    try {
      for await (const page of queryPages(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
        ScanIndexForward: false,
        Limit: 100,
      })) {
        for (const raw of page) {
          const entity = this.mapper.toEntity(raw);
          if (
            target.has(entity.characterId) &&
            entity.consumedAt === undefined &&
            !map.has(entity.characterId)
          ) {
            map.set(entity.characterId, entity);
          }
        }

        if (map.size >= target.size) break;
      }
    } catch (error) {
      throw toDatabaseError(error);
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
