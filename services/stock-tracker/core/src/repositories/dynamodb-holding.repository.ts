/**
 * Stock Tracker Core - DynamoDB Holding Repository
 *
 * DynamoDBを使用したHoldingRepositoryの実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  toDatabaseError,
  queryPage,
  type EntityStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { HoldingRepository } from './holding.repository.interface.js';
import type {
  HoldingEntity,
  HoldingKey,
  CreateHoldingInput,
  UpdateHoldingInput,
} from '../entities/holding.entity.js';
import {
  HoldingMapper,
  HOLDING_GSI1_SK_PREFIX,
  buildHoldingGsi1Pk,
} from '../mappers/holding.mapper.js';

/**
 * DynamoDB Holding Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の Query だけを自前で持つ
 */
export class DynamoDBHoldingRepository implements HoldingRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new HoldingMapper();
  private readonly entityStore: EntityStore<HoldingEntity, HoldingKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * ユーザーIDとティッカーIDで単一の保有株式を取得
   */
  public async getById(userId: string, tickerId: string): Promise<HoldingEntity | null> {
    return this.entityStore.get({ userId, tickerId });
  }

  /**
   * ユーザーの保有株式一覧を取得（GSI1=UserIndexを使用）
   */
  public async getByUserId(
    userId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<HoldingEntity>> {
    try {
      const page = await queryPage(
        this.docClient,
        {
          TableName: this.tableName,
          IndexName: 'UserIndex',
          KeyConditionExpression: '#gsi1pk = :userId AND begins_with(#gsi1sk, :prefix)',
          ExpressionAttributeNames: {
            '#gsi1pk': 'GSI1PK',
            '#gsi1sk': 'GSI1SK',
          },
          ExpressionAttributeValues: {
            ':userId': buildHoldingGsi1Pk(userId),
            ':prefix': HOLDING_GSI1_SK_PREFIX,
          },
        },
        { limit: options?.limit || 50, cursor: options?.cursor }
      );

      const items = page.items.map((item) => this.mapper.toEntity(item));

      return {
        items,
        nextCursor: page.nextCursor,
        count: page.count,
      };
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 新しい保有株式を作成
   */
  public async create(input: CreateHoldingInput): Promise<HoldingEntity> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  /**
   * 保有株式を更新
   */
  public async update(
    userId: string,
    tickerId: string,
    updates: UpdateHoldingInput
  ): Promise<HoldingEntity> {
    return this.entityStore.update({ userId, tickerId }, updates);
  }

  /**
   * 保有株式を削除
   */
  public async delete(userId: string, tickerId: string): Promise<void> {
    await this.entityStore.delete({ userId, tickerId });
  }
}
