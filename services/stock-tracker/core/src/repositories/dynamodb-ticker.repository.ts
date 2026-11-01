/**
 * Stock Tracker Core - DynamoDB Ticker Repository
 *
 * DynamoDBを使用したTickerRepositoryの実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  toDatabaseError,
  queryAllItems,
  scanAllItems,
  scanPage,
  type EntityStore,
  type PaginationOptions,
  type PaginatedResult,
} from '@nagiyu/aws';
import type { TickerRepository } from './ticker.repository.interface.js';
import type {
  TickerEntity,
  TickerKey,
  CreateTickerInput,
  UpdateTickerInput,
} from '../entities/ticker.entity.js';
import { TickerMapper, buildTickerGsi3Pk } from '../mappers/ticker.mapper.js';

/**
 * DynamoDB Ticker Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の Query と Scan だけを自前で持つ
 */
export class DynamoDBTickerRepository implements TickerRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new TickerMapper();
  private readonly entityStore: EntityStore<TickerEntity, TickerKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * ティッカーIDで単一のティッカーを取得
   */
  public async getById(tickerId: string): Promise<TickerEntity | null> {
    return this.entityStore.get({ tickerId });
  }

  /**
   * 取引所ごとのティッカー一覧を取得（GSI3=ExchangeTickerIndexを使用）
   *
   * GSI3SK（`TICKER#{TickerID}`）昇順のQueryで、インタフェース契約のTickerID昇順を実現する。
   * LastEvaluatedKeyがなくなるまでQueryをループして全件を集約する契約のため、
   * Limitは指定しない（DynamoDBの1MBページ単位）。
   */
  public async getByExchange(exchangeId: string): Promise<TickerEntity[]> {
    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: 'ExchangeTickerIndex',
        KeyConditionExpression: '#gsi3pk = :exchangeId',
        ExpressionAttributeNames: {
          '#gsi3pk': 'GSI3PK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': buildTickerGsi3Pk(exchangeId),
        },
      });
      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 全ティッカー取得（Scan with filter）
   *
   * ScanはGSIを介さず全件を走査するため、返却順序を保証しない。options未指定時は
   * LastEvaluatedKeyループで全件集約し、nextCursorはundefinedを返す。
   */
  public async getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>> {
    try {
      const usePagination = options?.limit !== undefined || options?.cursor !== undefined;

      if (!usePagination) {
        const items = await scanAllItems(this.docClient, {
          TableName: this.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': this.mapper.entityType,
          },
        });
        const allItems = items.map((item) => this.mapper.toEntity(item));

        return {
          items: allItems,
          nextCursor: undefined,
          count: allItems.length,
        };
      }

      const page = await scanPage(
        this.docClient,
        {
          TableName: this.tableName,
          FilterExpression: '#type = :type',
          ExpressionAttributeNames: {
            '#type': 'Type',
          },
          ExpressionAttributeValues: {
            ':type': this.mapper.entityType,
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
   * 新しいティッカーを作成
   */
  public async create(input: CreateTickerInput): Promise<TickerEntity> {
    return this.entityStore.create(input);
  }

  /**
   * ティッカーを更新
   */
  public async update(tickerId: string, updates: UpdateTickerInput): Promise<TickerEntity> {
    return this.entityStore.update({ tickerId }, updates);
  }

  /**
   * ティッカーを削除
   */
  public async delete(tickerId: string): Promise<void> {
    await this.entityStore.delete({ tickerId });
  }
}
