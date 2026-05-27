import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError, type DynamoDBItem } from '@nagiyu/aws';
import { MEMORY_TIER_C_TTL_SECONDS, MEMORY_TIER_D_TTL_SECONDS } from '../constants.js';
import type {
  CreateMemoryInput,
  MemoryEntity,
  MemoryKey,
  Tier,
  UpdateMemoryInput,
} from '../entities/memory.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { MemoryMapper } from '../mappers/memory.mapper.js';
import {
  buildMemoryAllTiersSKPrefix,
  buildMemoryTierSKPrefix,
  buildUserPK,
} from '../mappers/keys.js';
import type { MemoryRepository } from './memory.repository.interface.js';

export class DynamoDBMemoryRepository implements MemoryRepository {
  private readonly mapper: MemoryMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowIso: () => string;
  private readonly nowSec: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowIso: () => string = () => new Date().toISOString(),
    nowSec: () => number = () => Math.floor(Date.now() / 1000)
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.ulidFactory = ulidFactory;
    this.nowIso = nowIso;
    this.nowSec = nowSec;
    this.mapper = new MemoryMapper();
  }

  public async put(input: CreateMemoryInput): Promise<MemoryEntity> {
    const now = this.nowIso();
    const memoryId = input.MemoryID ?? this.ulidFactory();

    const entity: MemoryEntity = {
      ...input,
      MemoryID: memoryId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item: DynamoDBItem = { ...this.mapper.toItem(entity) };
    const ttlSec = this.resolveTtlSec(entity.Tier);
    if (ttlSec !== null) {
      item.TTL = this.nowSec() + ttlSec;
    }

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
        })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async get(key: MemoryKey): Promise<MemoryEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listByTier(
    userId: string,
    characterId: string,
    tier: Tier
  ): Promise<MemoryEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildMemoryTierSKPrefix(characterId, tier);
    return this.queryByPrefix(pk, prefix);
  }

  public async listByCategory(
    userId: string,
    characterId: string,
    category: string
  ): Promise<MemoryEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildMemoryAllTiersSKPrefix(characterId);
    const all = await this.queryByPrefix(pk, prefix);
    return all.filter((m) => m.Category === category);
  }

  public async update(input: UpdateMemoryInput): Promise<MemoryEntity> {
    const { pk, sk } = this.mapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
      tier: input.Tier,
      category: input.Category,
      memoryId: input.MemoryID,
    });

    const setExpressions: string[] = ['#UpdatedAt = :updatedAt'];
    const names: Record<string, string> = { '#UpdatedAt': 'UpdatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': this.nowIso() };

    if (input.Content !== undefined) {
      setExpressions.push('#Content = :content');
      names['#Content'] = 'Content';
      values[':content'] = input.Content;
    }
    if (input.Confidence !== undefined) {
      setExpressions.push('#Confidence = :confidence');
      names['#Confidence'] = 'Confidence';
      values[':confidence'] = input.Confidence;
    }
    if (input.ReferencedCount !== undefined) {
      setExpressions.push('#ReferencedCount = :referencedCount');
      names['#ReferencedCount'] = 'ReferencedCount';
      values[':referencedCount'] = input.ReferencedCount;
    }
    if (input.LastReferencedAt !== undefined) {
      setExpressions.push('#LastReferencedAt = :lastReferencedAt');
      names['#LastReferencedAt'] = 'LastReferencedAt';
      values[':lastReferencedAt'] = input.LastReferencedAt;
    }
    if (input.Embedding !== undefined) {
      setExpressions.push('#Embedding = :embedding');
      names['#Embedding'] = 'Embedding';
      values[':embedding'] = input.Embedding;
    }

    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${setExpressions.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(PK)',
          ReturnValues: 'ALL_NEW',
        })
      );
      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('Memory', `${pk}#${sk}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async delete(key: MemoryKey): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async promote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    return this.changeTierTransact(memory, toTier);
  }

  public async demote(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    return this.changeTierTransact(memory, toTier);
  }

  private async changeTierTransact(memory: MemoryEntity, toTier: Tier): Promise<MemoryEntity> {
    const { pk: oldPk, sk: oldSk } = this.mapper.buildKeys({
      userId: memory.UserID,
      characterId: memory.CharacterID,
      tier: memory.Tier,
      category: memory.Category,
      memoryId: memory.MemoryID,
    });

    const now = this.nowIso();
    const newEntity: MemoryEntity = { ...memory, Tier: toTier, UpdatedAt: now };
    const newItem: DynamoDBItem = { ...this.mapper.toItem(newEntity) };

    const ttlSec = this.resolveTtlSec(toTier);
    if (ttlSec !== null) {
      newItem.TTL = this.nowSec() + ttlSec;
    }

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: newItem,
              },
            },
            {
              Delete: {
                TableName: this.tableName,
                Key: { PK: oldPk, SK: oldSk },
              },
            },
          ],
        })
      );
      return newEntity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  private async queryByPrefix(pk: string, skPrefix: string): Promise<MemoryEntity[]> {
    const results: MemoryEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        results.push(this.mapper.toEntity(raw as unknown as DynamoDBItem));
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }

  private resolveTtlSec(tier: Tier): number | null {
    if (tier === 'C') return MEMORY_TIER_C_TTL_SECONDS;
    if (tier === 'D') return MEMORY_TIER_D_TTL_SECONDS;
    return null;
  }
}
