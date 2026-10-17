import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  queryAllItems,
  toDatabaseError,
  type DynamoDBAttributes,
  type EntityStore,
} from '@nagiyu/aws';
import type { Highlight, HighlightKey, UpdateHighlightInput } from '../types.js';
import type { HighlightRepository } from './highlight.repository.interface.js';
import {
  HIGHLIGHT_SK_PREFIX,
  HighlightMapper,
  buildHighlightPk,
} from '../mappers/highlight.mapper.js';

/**
 * DynamoDB Highlight Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、ジョブ単位の一覧 Query だけを自前で持つ
 */
export class DynamoDBHighlightRepository implements HighlightRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new HighlightMapper();
  private readonly entityStore: EntityStore<Highlight, HighlightKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async getByJobId(jobId: string): Promise<Highlight[]> {
    let rawItems: DynamoDBAttributes[];
    try {
      rawItems = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :highlightPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': buildHighlightPk(jobId),
          ':highlightPrefix': HIGHLIGHT_SK_PREFIX,
        },
      });
    } catch (error) {
      throw toDatabaseError(error);
    }

    return rawItems.map((item) => this.mapper.toEntity(item)).sort((a, b) => a.order - b.order);
  }

  public async getById(jobId: string, highlightId: string): Promise<Highlight | null> {
    return this.entityStore.get({ jobId, highlightId });
  }

  public async update(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput
  ): Promise<Highlight> {
    return this.entityStore.update({ jobId, highlightId }, updates);
  }

  public async createMany(highlights: Highlight[]): Promise<void> {
    // 既存データとの差分適用を許容するため、upsert (put) で書く。
    await Promise.all(highlights.map((highlight) => this.entityStore.put(highlight)));
  }
}
