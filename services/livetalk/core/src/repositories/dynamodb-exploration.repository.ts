import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  ExplorationEntity,
  ExplorationKey,
  PutExplorationInput,
} from '../entities/exploration.entity.js';
import { ExplorationMapper } from '../mappers/exploration.mapper.js';
import { buildExplorationSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { ExplorationRepository } from './exploration.repository.interface.js';

export class DynamoDBExplorationRepository implements ExplorationRepository {
  private readonly mapper = new ExplorationMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<ExplorationEntity, ExplorationKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: PutExplorationInput): Promise<ExplorationEntity> {
    return this.entityStore.put(input);
  }

  public async listAll(userId: string, characterId: string): Promise<ExplorationEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildUserPK(userId),
          ':prefix': buildExplorationSKPrefix(characterId),
        },
      });
      return items.map((raw) => this.mapper.toEntity(raw));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async delete(key: ExplorationKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }
}
