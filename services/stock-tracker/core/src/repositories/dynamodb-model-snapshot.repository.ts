/**
 * Stock Tracker Core - DynamoDB ModelSnapshot Repository
 *
 * DynamoDBを使用したModelSnapshotRepositoryの実装
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  isConditionalCheckFailed,
  toDatabaseError,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type {
  CreateModelSnapshotResult,
  ModelSnapshotRepository,
} from './model-snapshot.repository.interface.js';
import type { Market, ModelSnapshotItem, Question } from '../forecast/index.js';
import { ModelSnapshotMapper } from '../mappers/model-snapshot.mapper.js';

/**
 * DynamoDB ModelSnapshot Repository
 *
 * DynamoDBを使用したモデルスナップショットリポジトリの実装
 */
export class DynamoDBModelSnapshotRepository implements ModelSnapshotRepository {
  private readonly mapper: ModelSnapshotMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new ModelSnapshotMapper();
  }

  /**
   * ModelSnapshot を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(item: ModelSnapshotItem): Promise<CreateModelSnapshotResult> {
    try {
      const dbItem = this.mapper.toItem(item);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: dbItem,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return { item: this.mapper.toEntity(dbItem), created: true };
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        const existing = await this.getByDate(item.question, item.market, item.date);
        if (!existing) {
          throw new DatabaseError(
            'ModelSnapshot の作成に失敗しましたが、既存アイテムが見つかりません'
          );
        }
        return { item: existing, created: false };
      }
      throw toDatabaseError(error);
    }
  }

  /**
   * 問い・市場・日付で単一の ModelSnapshot を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ question, market, date });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 問い・市場について、指定日より前の最新の ModelSnapshot を取得する
   *
   * SK（`DATE#{Date}`）降順・Limit 1 の Query で最新 1 件だけを取得する。
   */
  public async getLatestBefore(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null> {
    try {
      const { pk } = this.mapper.buildKeys({ question, market, date });

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#pk = :pk AND #sk < :date',
          ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
          ExpressionAttributeValues: { ':pk': pk, ':date': `DATE#${date}` },
          ScanIndexForward: false,
          Limit: 1,
        })
      );

      const items = (result.Items as DynamoDBItem[] | undefined) ?? [];
      if (items.length === 0) {
        return null;
      }

      return this.mapper.toEntity(items[0]);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
