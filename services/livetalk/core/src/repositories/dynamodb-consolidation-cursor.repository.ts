import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  ConsolidationCursorEntity,
  PutConsolidationCursorInput,
} from '../entities/consolidation-cursor.entity.js';
import { ConsolidationCursorMapper } from '../mappers/consolidation-cursor.mapper.js';
import { OptimisticLockError } from './optimistic-lock.error.js';
import type { ConsolidationCursorRepository } from './consolidation-cursor.repository.interface.js';

/**
 * 集約（consolidation）カーソルリポジトリの DynamoDB 実装（リブトーク知識再設計 P1 / #3697）。
 */
export class DynamoDBConsolidationCursorRepository implements ConsolidationCursorRepository {
  private readonly mapper: ConsolidationCursorMapper;
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
    this.mapper = new ConsolidationCursorMapper();
  }

  public async get(userId: string, characterId: string): Promise<ConsolidationCursorEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ userId, characterId });
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

  public async put(
    entity: PutConsolidationCursorInput,
    opts: { expectedUpdatedAt?: number } = {}
  ): Promise<ConsolidationCursorEntity> {
    const now = this.nowMs();
    const merged: ConsolidationCursorEntity = { ...entity, UpdatedAt: now };
    const isUpdate = opts.expectedUpdatedAt !== undefined;

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(merged),
          ConditionExpression: isUpdate
            ? 'UpdatedAt = :expectedUpdatedAt'
            : 'attribute_not_exists(PK)',
          ...(isUpdate
            ? { ExpressionAttributeValues: { ':expectedUpdatedAt': opts.expectedUpdatedAt } }
            : {}),
        })
      );
      return merged;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new OptimisticLockError(
          'ConsolidationCursor',
          `${merged.UserID}#${merged.CharacterID}`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
