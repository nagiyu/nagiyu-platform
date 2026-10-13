/**
 * Stock Tracker Core - DynamoDB Exchange Repository
 *
 * DynamoDBを使用したExchangeRepositoryの実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, toDatabaseError, scanAllItems, type EntityStore } from '@nagiyu/aws';
import type { ExchangeRepository } from './exchange.repository.interface.js';
import type {
  ExchangeEntity,
  ExchangeKey,
  CreateExchangeInput,
  UpdateExchangeInput,
} from '../entities/exchange.entity.js';
import { ExchangeMapper } from '../mappers/exchange.mapper.js';
import { queryExchangeItems } from './query-exchange-index.js';

/**
 * DynamoDB Exchange Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、Scan と GSI の Query だけを自前で持つ
 */
export class DynamoDBExchangeRepository implements ExchangeRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new ExchangeMapper();
  private readonly entityStore: EntityStore<ExchangeEntity, ExchangeKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * 取引所IDで単一の取引所を取得
   */
  public async getById(exchangeId: string): Promise<ExchangeEntity | null> {
    return this.entityStore.get({ exchangeId });
  }

  /**
   * 全取引所を取得
   *
   * Type フィルタ付き Scan で取得するため、GSI キーの有無にかかわらず常に全件を返す。
   * 返却順序は保証しない。LastEvaluatedKey ループで全件を集約する。
   */
  public async getAll(): Promise<ExchangeEntity[]> {
    try {
      return await this.scanAll();
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * ExchangeTickerIndex の Query で取引所を取得する(GSI キー付きのみ)
   *
   * テーブル全体を走査しないため速い。一方で GSI キーは作成時と更新時にしか付かないので、
   * キー未付与の取引所が混在する移行途中では、それらが結果から欠ける。
   * Query が 0 件のときだけ Scan にフォールバックする。
   * 欠けても許容できる読み取り専用の一覧表示でのみ使い、それ以外は getAll を使うこと。
   * 返却順序は保証しない(Query 経路は ExchangeID 昇順、Scan 経路は不定)。
   */
  public async getAllIndexed(): Promise<ExchangeEntity[]> {
    try {
      const indexed = await queryExchangeItems(this.docClient, this.tableName);
      if (indexed.length > 0) {
        return indexed.map((item) => this.mapper.toEntity(item));
      }
      return await this.scanAll();
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 新しい取引所を作成
   */
  public async create(input: CreateExchangeInput): Promise<ExchangeEntity> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  /**
   * 取引所を更新
   */
  public async update(exchangeId: string, updates: UpdateExchangeInput): Promise<ExchangeEntity> {
    return this.entityStore.update({ exchangeId }, updates);
  }

  /**
   * 取引所を削除
   */
  public async delete(exchangeId: string): Promise<void> {
    await this.entityStore.delete({ exchangeId });
  }

  /**
   * Type フィルタ付き Scan で全取引所を取得する
   */
  private async scanAll(): Promise<ExchangeEntity[]> {
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
    return items.map((item) => this.mapper.toEntity(item));
  }
}
