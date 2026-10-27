/**
 * Stock Tracker Core - DynamoDB ModelSnapshot Repository
 *
 * DynamoDBを使用したModelSnapshotRepositoryの実装
 */
import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  DynamoDBEntityStore,
  EntityAlreadyExistsError,
  toDatabaseError,
  type EntityStore,
} from '@nagiyu/aws';
import type {
  CreateModelSnapshotResult,
  ModelSnapshotRepository,
} from './model-snapshot.repository.interface.js';
import type { ModelSnapshotKey } from '../entities/model-snapshot.entity.js';
import type { Market, ModelSnapshotItem, Question } from '../forecast/index.js';
import {
  ModelSnapshotMapper,
  buildModelSnapshotPk,
  buildModelSnapshotSk,
} from '../mappers/model-snapshot.mapper.js';

/**
 * DynamoDB ModelSnapshot Repository
 *
 * 単一アイテムの作成・取得は EntityStore に任せ、直前のスナップショットを探す Query だけを自前で持つ
 */
export class DynamoDBModelSnapshotRepository implements ModelSnapshotRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new ModelSnapshotMapper();
  private readonly entityStore: EntityStore<ModelSnapshotItem, ModelSnapshotKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * ModelSnapshot を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(item: ModelSnapshotItem): Promise<CreateModelSnapshotResult> {
    try {
      return { item: await this.entityStore.create(item), created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.entityStore.get(this.mapper.getKey(item));
        if (!existing) {
          throw new DatabaseError(
            'ModelSnapshot の作成に失敗しましたが、既存アイテムが見つかりません',
            error
          );
        }
        return { item: existing, created: false };
      }
      throw error;
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
    return this.entityStore.get({ question, market, date });
  }

  /**
   * 問い・市場について、指定日より前の最新の ModelSnapshot を取得する
   *
   * SK 降順・Limit 1 の Query で最新 1 件だけを取得する。
   */
  public async getLatestBefore(
    question: Question,
    market: Market,
    date: string
  ): Promise<ModelSnapshotItem | null> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#pk = :pk AND #sk < :date',
          ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
          ExpressionAttributeValues: {
            ':pk': buildModelSnapshotPk(question, market),
            ':date': buildModelSnapshotSk(date),
          },
          ScanIndexForward: false,
          Limit: 1,
        })
      );

      const items = result.Items ?? [];
      if (items.length === 0) {
        return null;
      }

      return this.mapper.toEntity(items[0]);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
