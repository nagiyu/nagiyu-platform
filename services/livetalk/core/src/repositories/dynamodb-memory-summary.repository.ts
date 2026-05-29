import {
  GetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateMemorySummaryInput,
  MemorySummaryEntity,
} from '../entities/memory-summary.entity.js';
import { MemorySummaryMapper } from '../mappers/memory-summary.mapper.js';
import { buildMemorySummarySK, buildUserPK } from '../mappers/keys.js';
import type { MemorySummaryRepository } from './memory-summary.repository.interface.js';

export class DynamoDBMemorySummaryRepository implements MemorySummaryRepository {
  private readonly mapper: MemorySummaryMapper;
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
    this.mapper = new MemorySummaryMapper();
  }

  public async get(userId: string, characterId: string): Promise<MemorySummaryEntity | null> {
    try {
      const pk = buildUserPK(userId);
      const sk = buildMemorySummarySK(characterId);
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

  public async put(input: CreateMemorySummaryInput): Promise<MemorySummaryEntity> {
    const now = this.nowMs();
    const pk = buildUserPK(input.UserID);
    const sk = buildMemorySummarySK(input.CharacterID);

    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: [
            'SET #type = :type',
            'UserID = :userId',
            'CharacterID = :characterId',
            'SummaryText = :summaryText',
            'LastCompressedAt = :lastCompressedAt',
            'UpdatedAt = :updatedAt',
            'CreatedAt = if_not_exists(CreatedAt, :createdAt)',
          ].join(', '),
          ExpressionAttributeNames: { '#type': 'Type' },
          ExpressionAttributeValues: {
            ':type': this.mapper.entityType,
            ':userId': input.UserID,
            ':characterId': input.CharacterID,
            ':summaryText': input.SummaryText,
            ':lastCompressedAt': input.LastCompressedAt,
            ':updatedAt': now,
            ':createdAt': now,
          },
          ReturnValues: 'ALL_NEW',
        })
      );
      return this.mapper.toEntity(result.Attributes as unknown as DynamoDBItem);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
