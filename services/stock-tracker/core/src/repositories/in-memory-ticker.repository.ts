/**
 * Stock Tracker Core - InMemory Ticker Repository
 *
 * InMemorySingleTableStoreを使用したTickerRepositoryの実装
 */

import {
  InMemoryEntityStore,
  type EntityStore,
  type InMemorySingleTableStore,
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

const FULL_SCAN_PAGE_SIZE = 100;

/**
 * InMemory Ticker Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI の近似クエリと Type 属性の走査だけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryTickerRepository implements TickerRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new TickerMapper();
  private readonly entityStore: EntityStore<TickerEntity, TickerKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * ティッカーIDで単一のティッカーを取得
   */
  public async getById(tickerId: string): Promise<TickerEntity | null> {
    return this.entityStore.get({ tickerId });
  }

  /**
   * 取引所ごとのティッカー一覧を取得
   *
   * GSI3（ExchangeTickerIndex）をqueryByAttributeでシミュレートする。GSI3SK（`TICKER#{TickerID}`）
   * 昇順ソートで、インタフェース契約のTickerID昇順を実現する。全件を返す契約のため、
   * nextCursorがなくなるまでstoreのページを辿り切って集約する。
   */
  public async getByExchange(exchangeId: string): Promise<TickerEntity[]> {
    const items: TickerEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = this.store.queryByAttribute(
        {
          attributeName: 'GSI3PK',
          attributeValue: buildTickerGsi3Pk(exchangeId),
          // sk条件を指定しないため、実DynamoDBのGSI3 Queryと同様にGSI3SK昇順で返すよう明示する
          gsiSortKeyAttributeName: 'GSI3SK',
        },
        {
          limit: FULL_SCAN_PAGE_SIZE,
          cursor,
        }
      );
      items.push(...page.items.map((item) => this.mapper.toEntity(item)));
      cursor = page.nextCursor;
    } while (cursor);

    return items;
  }

  /**
   * 全ティッカー取得
   *
   * `Type`属性の一致でScanを近似する（GSIを介さない）ため、返却順序は保証しない。
   * options未指定時は、実DynamoDB実装（Scan+LastEvaluatedKeyループ）に合わせて
   * cursorループで全件集約し、nextCursorはundefinedを返す。
   */
  public async getAll(options?: PaginationOptions): Promise<PaginatedResult<TickerEntity>> {
    const usePagination = options?.limit !== undefined || options?.cursor !== undefined;

    if (!usePagination) {
      const items: TickerEntity[] = [];
      let cursor: string | undefined;

      do {
        const page = this.store.queryByAttribute(
          {
            attributeName: 'Type',
            attributeValue: this.mapper.entityType,
          },
          {
            limit: FULL_SCAN_PAGE_SIZE,
            cursor,
          }
        );
        items.push(...page.items.map((item) => this.mapper.toEntity(item)));
        cursor = page.nextCursor;
      } while (cursor);

      return {
        items,
        nextCursor: undefined,
        count: items.length,
      };
    }

    const result = this.store.queryByAttribute(
      {
        attributeName: 'Type',
        attributeValue: this.mapper.entityType,
      },
      options
    );

    const items = result.items.map((item) => this.mapper.toEntity(item));

    return {
      items,
      nextCursor: result.nextCursor,
      count: result.count,
    };
  }

  /**
   * 新しいティッカーを作成
   */
  public async create(input: CreateTickerInput): Promise<TickerEntity> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
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
