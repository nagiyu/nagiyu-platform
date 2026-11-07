import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey,
  PutFreshnessCheckRequestInput,
} from '../entities/freshness-check-request.entity.js';
import { FreshnessCheckRequestMapper } from '../mappers/freshness-check-request.mapper.js';
import { buildFreshnessCheckRequestSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { FreshnessCheckRequestRepository } from './freshness-check-request.repository.interface.js';

export class DynamoDBFreshnessCheckRequestRepository implements FreshnessCheckRequestRepository {
  private readonly mapper = new FreshnessCheckRequestMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<FreshnessCheckRequestEntity, FreshnessCheckRequestKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: PutFreshnessCheckRequestInput): Promise<FreshnessCheckRequestEntity> {
    const { entity } = await this.entityStore.createIfAbsent(input);
    return entity;
  }

  public async listByCharacter(
    userId: string,
    characterId: string
  ): Promise<FreshnessCheckRequestEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildUserPK(userId),
          ':prefix': buildFreshnessCheckRequestSKPrefix(characterId),
        },
      });
      return items
        .map((raw) => this.mapper.toEntity(raw))
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async delete(key: FreshnessCheckRequestKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
