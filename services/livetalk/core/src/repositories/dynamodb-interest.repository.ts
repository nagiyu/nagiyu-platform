import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateInterestCategoryInput,
  InterestCategoryEntity,
  InterestCategoryKey,
} from '../entities/interest-category.entity.js';
import { InterestCategoryMapper } from '../mappers/interest-category.mapper.js';
import { buildInterestSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { InterestRepository } from './interest.repository.interface.js';

export class DynamoDBInterestRepository implements InterestRepository {
  private readonly mapper: InterestCategoryMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.mapper = new InterestCategoryMapper();
  }

  public async get(
    userId: string,
    characterId: string,
    category: string
  ): Promise<InterestCategoryEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, characterId, category });
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async list(userId: string, characterId: string): Promise<InterestCategoryEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildInterestSKPrefix(characterId);
    const results: InterestCategoryEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
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

  public async put(input: CreateInterestCategoryInput): Promise<InterestCategoryEntity> {
    const now = this.nowMs();
    const pk = buildUserPK(input.UserID);
    const { sk } = this.mapper.buildKeys({
      userId: input.UserID,
      characterId: input.CharacterID,
      category: input.Category,
    });

    try {
      const expressions = [
        'SET #type = :type',
        'UserID = :userId',
        'CharacterID = :characterId',
        'Category = :category',
        'Weight = :weight',
        'UpdatedAt = :updatedAt',
        'CreatedAt = if_not_exists(CreatedAt, :createdAt)',
      ];
      const values: Record<string, unknown> = {
        ':type': this.mapper.entityType,
        ':userId': input.UserID,
        ':characterId': input.CharacterID,
        ':category': input.Category,
        ':weight': input.Weight,
        ':updatedAt': now,
        ':createdAt': now,
      };
      if (input.Embedding !== undefined) {
        expressions.push('Embedding = :embedding');
        values[':embedding'] = input.Embedding;
      }
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: expressions.join(', '),
          ExpressionAttributeNames: { '#type': 'Type' },
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      );
      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async update(entity: InterestCategoryEntity): Promise<InterestCategoryEntity> {
    const now = this.nowMs();
    const pk = buildUserPK(entity.UserID);
    const { sk } = this.mapper.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      category: entity.Category,
    });

    try {
      const expressions = ['SET Weight = :weight', 'UpdatedAt = :updatedAt'];
      const values: Record<string, unknown> = { ':weight': entity.Weight, ':updatedAt': now };
      if (entity.Embedding !== undefined) {
        expressions.push('Embedding = :embedding');
        values[':embedding'] = entity.Embedding;
      }
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: expressions.join(', '),
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        })
      );
      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async delete(key: InterestCategoryKey): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys(key);
      await this.docClient.send(
        new DeleteCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
