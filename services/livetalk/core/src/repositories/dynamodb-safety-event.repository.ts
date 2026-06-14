import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityAlreadyExistsError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreateSafetyEventInput,
  SafetyEventEntity,
  SafetyEventKey,
  SafetyEventSummary,
} from '../entities/safety-event.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { SAFETY_EVENT_GSI_INDEX_NAME, buildSafetyEventGSI2PK } from '../mappers/keys.js';
import { SafetyEventMapper } from '../mappers/safety-event.mapper.js';
import type { SafetyEventRepository } from './safety-event.repository.interface.js';

export class DynamoDBSafetyEventRepository implements SafetyEventRepository {
  private readonly mapper: SafetyEventMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.mapper = new SafetyEventMapper();
  }

  public async create(input: CreateSafetyEventInput): Promise<SafetyEventEntity> {
    const now = this.nowMs();
    const eventId = input.EventID ?? this.ulidFactory(now);

    const entity: SafetyEventEntity = {
      ...input,
      EventID: eventId,
      CreatedAt: now,
      UpdatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.mapper.toItem(entity),
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );
      return entity;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError(
          this.mapper.entityType,
          `${entity.UserID}#${entity.EventID}`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async getById(key: SafetyEventKey): Promise<SafetyEventEntity | null> {
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

  public async listRecent(limit: number): Promise<SafetyEventSummary[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: SAFETY_EVENT_GSI_INDEX_NAME,
          KeyConditionExpression: '#gsi2pk = :pk',
          ExpressionAttributeNames: { '#gsi2pk': 'GSI2PK' },
          ExpressionAttributeValues: { ':pk': buildSafetyEventGSI2PK() },
          ScanIndexForward: false, // 降順（最近の検出が先頭）
          Limit: limit,
        })
      );
      return (result.Items ?? []).map((item) =>
        this.mapper.toSummary(item as unknown as DynamoDBItem)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
