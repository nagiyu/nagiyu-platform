/**
 * Stock Tracker Core - InMemory Daily Summary Repository
 *
 * InMemorySingleTableStoreを使用したDailySummaryRepositoryの実装
 */

import {
  InMemorySingleTableStore,
  type AttributeQueryCondition,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import { DailySummaryMapper } from '../mappers/daily-summary.mapper.js';

// store既定のqueryByAttribute limit（100件）で打ち切られると、GSI4SK昇順の先頭ページ
// （＝最古側）だけが返り「最新日」の算出などが壊れるため、in-memory-ticker.repository.ts の
// getAllと同じ流儀でcursorループにより全件集約する（ページサイズ自体は任意）。
const GSI4_FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory Daily Summary Repository
 *
 * InMemorySingleTableStoreを使用した日次サマリーリポジトリの実装
 * テスト環境で使用
 */
export class InMemoryDailySummaryRepository implements DailySummaryRepository {
  private readonly mapper: DailySummaryMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new DailySummaryMapper();
  }

  /**
   * TickerID と Date でサマリーを取得
   */
  public async getByTickerAndDate(
    tickerId: string,
    date: string
  ): Promise<DailySummaryEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ tickerId, date });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * 取引所IDでサマリーを取得
   *
   * GSI4（ExchangeSummaryIndex）をqueryByAttributeでシミュレートする。GSI4SK
   * （`DATE#{Date}#{TickerID}`）昇順ソートで、インタフェース契約のDate昇順・
   * 同日内TickerID昇順を実現する。store既定limit（100件）による打ち切りを避けるため、
   * queryAllByGsi4のcursorループで全件を集約してから最新日を判定する（date省略時）。
   */
  public async getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]> {
    const summaries = this.queryAllByGsi4({
      attributeName: 'GSI4PK',
      attributeValue: exchangeId,
      // date省略時（sk条件なし）でも、実DynamoDBのGSI4 Queryと同様にGSI4SK昇順で返すよう明示する。
      // date指定時はsk条件のattributeNameが優先されるため、このフィールドは無視される。
      gsiSortKeyAttributeName: 'GSI4SK',
      ...(date
        ? {
            sk: {
              attributeName: 'GSI4SK',
              operator: 'begins_with' as const,
              value: `DATE#${date}`,
            },
          }
        : {}),
    });

    if (date || summaries.length === 0) {
      return summaries;
    }

    const latestDate = summaries.reduce((latest, summary) => {
      return summary.Date > latest ? summary.Date : latest;
    }, summaries[0].Date);

    return summaries.filter((summary) => summary.Date === latestDate);
  }

  /**
   * 取引所IDと日付範囲でサマリーを取得（GSI4 をシミュレート、両端含む）
   *
   * `DATE#{toDate}#~` のセンチネル（dynamodb-daily-summary.repository.tsと同じ方式）は、
   * TickerIDに `~`（0x7E）より大きいコードポイントの文字が含まれる場合、`toDate` 分の
   * その項目を取りこぼす前提がある。現行のTickerID体系（`NSDQ:AAPL` 形式）では起きない。
   */
  public async getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]> {
    return this.queryAllByGsi4({
      attributeName: 'GSI4PK',
      attributeValue: exchangeId,
      sk: {
        attributeName: 'GSI4SK',
        operator: 'between' as const,
        value: [`DATE#${fromDate}`, `DATE#${toDate}#~`],
      },
    });
  }

  /**
   * 取引所IDと日付範囲で、確度算出に使う属性だけを取得する（GSI4 をシミュレート、両端含む）。
   *
   * InMemory の store は実際の ProjectionExpression を持たないため、通常どおり全属性を
   * 読んでから `toForecastFields` で絞る（DynamoDB 実装との読み出し量の違いはここでは
   * 再現しない。契約上の型・値が一致することの確認が目的）。
   */
  public async getForecastFieldsByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryForecastFields[]> {
    const items = this.queryRawByGsi4({
      attributeName: 'GSI4PK',
      attributeValue: exchangeId,
      sk: {
        attributeName: 'GSI4SK',
        operator: 'between' as const,
        value: [`DATE#${fromDate}`, `DATE#${toDate}#~`],
      },
    });
    return items.map((item) => this.mapper.toForecastFields(item));
  }

  /**
   * GSI4条件に一致する全アイテムをcursorループで集約し、Entityへ変換して返す。
   * store既定limit（100件）による打ち切りを避けるため、getByExchange /
   * getByExchangeAndDateRangeはこのヘルパーを経由する。
   */
  private queryAllByGsi4(condition: AttributeQueryCondition): DailySummaryEntity[] {
    return this.queryRawByGsi4(condition).map((item) => this.mapper.toEntity(item));
  }

  /**
   * GSI4条件に一致する全アイテム（DynamoDBItem のまま）をcursorループで集約する。
   * Entity への変換方法が呼び出し側で異なる（`toEntity` / `toForecastFields`）ため、
   * 変換前の生アイテム集約だけをここに切り出す。
   */
  private queryRawByGsi4(condition: AttributeQueryCondition): DynamoDBItem[] {
    const items: DynamoDBItem[] = [];
    let cursor: string | undefined;

    do {
      const page = this.store.queryByAttribute(condition, {
        limit: GSI4_FULL_AGGREGATION_PAGE_SIZE,
        cursor,
      });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    return items;
  }

  /**
   * サマリーを保存（既存の場合は上書き）
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    const existing = await this.getByTickerAndDate(input.TickerID, input.Date);
    const now = Date.now();
    const entity: DailySummaryEntity = {
      ...input,
      CreatedAt: existing?.CreatedAt ?? now,
      UpdatedAt: now,
    };

    this.store.put(this.mapper.toItem(entity));
    return entity;
  }
}
