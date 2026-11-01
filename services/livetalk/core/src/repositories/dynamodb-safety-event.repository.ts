import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, toDatabaseError, type EntityStore } from '@nagiyu/aws';
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
  private readonly mapper = new SafetyEventMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly entityStore: EntityStore<SafetyEventEntity, SafetyEventKey>;

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
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async create(input: CreateSafetyEventInput): Promise<SafetyEventEntity> {
    const now = this.nowMs();
    return this.entityStore.create({
      ...input,
      eventId: input.eventId ?? this.ulidFactory(now),
      createdAt: now,
    });
  }

  public async getById(key: SafetyEventKey): Promise<SafetyEventEntity | null> {
    return this.entityStore.get(key);
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
      return (result.Items ?? []).map((item) => this.mapper.toSummary(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
