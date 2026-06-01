import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type { CreateKnowledgeInput, KnowledgeEntity } from '../entities/knowledge.entity.js';
import { KnowledgeMapper } from '../mappers/knowledge.mapper.js';
import { buildKnowledgeSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { KnowledgeRepository } from './knowledge.repository.interface.js';

export class DynamoDBKnowledgeRepository implements KnowledgeRepository {
  private readonly mapper: KnowledgeMapper;
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
    this.mapper = new KnowledgeMapper();
  }

  public async put(input: CreateKnowledgeInput): Promise<KnowledgeEntity> {
    const now = this.nowMs();
    const entity: KnowledgeEntity = { ...input, CreatedAt: now };
    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.mapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async list(userId: string, characterId: string, limit = 100): Promise<KnowledgeEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildKnowledgeSKPrefix(characterId);
    const results: KnowledgeEntity[] = [];
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
            ScanIndexForward: false,
            Limit: limit,
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

      if (!result.LastEvaluatedKey || results.length >= limit) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
  }

  public async getLatest(userId: string, characterId: string): Promise<KnowledgeEntity | null> {
    const pk = buildUserPK(userId);
    const prefix = buildKnowledgeSKPrefix(characterId);

    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
          ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
          ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
          ScanIndexForward: false,
          Limit: 1,
        })
      );

      const item = result.Items?.[0];
      if (!item) return null;
      return this.mapper.toEntity(item as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
