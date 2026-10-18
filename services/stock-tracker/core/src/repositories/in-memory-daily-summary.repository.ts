/**
 * Stock Tracker Core - InMemory Daily Summary Repository
 *
 * InMemorySingleTableStoreを使用したDailySummaryRepositoryの実装
 */

import {
  InMemoryEntityStore,
  type AttributeQueryCondition,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import type { DailySummaryRepository } from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryForecastFields,
  DailySummaryKey,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import { DailySummaryMapper, buildDailySummaryGsi4Pk } from '../mappers/daily-summary.mapper.js';
import {
  buildExchangeSummaryGsi4DatePrefix,
  buildExchangeSummaryGsi4DateUpperBound,
} from '../mappers/exchange-summary-index.js';

// store既定のqueryByAttribute limit (100件) で打ち切られると、GSI4SK昇順の先頭ページ
// (最古側) だけが返り「最新日」の算出などが壊れるため、cursorループにより全件集約する
// (ページサイズ自体は任意)。
const GSI4_FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory Daily Summary Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、GSI4 の近似クエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryDailySummaryRepository implements DailySummaryRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new DailySummaryMapper();
  private readonly entityStore: EntityStore<DailySummaryEntity, DailySummaryKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * TickerID と Date でサマリーを取得
   */
  public async getByTickerAndDate(
    tickerId: string,
    date: string
  ): Promise<DailySummaryEntity | null> {
    return this.entityStore.get({ tickerId, date });
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
      attributeValue: buildDailySummaryGsi4Pk(exchangeId),
      // date省略時（sk条件なし）でも、実DynamoDBのGSI4 Queryと同様にGSI4SK昇順で返すよう明示する。
      // date指定時はsk条件のattributeNameが優先されるため、このフィールドは無視される。
      gsiSortKeyAttributeName: 'GSI4SK',
      ...(date
        ? {
            sk: {
              attributeName: 'GSI4SK',
              operator: 'begins_with' as const,
              value: buildExchangeSummaryGsi4DatePrefix(date),
            },
          }
        : {}),
    });

    if (date || summaries.length === 0) {
      return summaries;
    }

    const latestDate = summaries.reduce((latest, summary) => {
      return summary.date > latest ? summary.date : latest;
    }, summaries[0].date);

    return summaries.filter((summary) => summary.date === latestDate);
  }

  /**
   * 取引所IDと日付範囲でサマリーを取得（GSI4 をシミュレート、両端含む）
   *
   * 上限は DynamoDB 実装と同じく、`DATE#{toDate}#~` にする。TickerID に `~` (0x7E) より大きい
   * コードポイントの文字が含まれると `toDate` 分のその項目を取りこぼすが、現行の TickerID 体系
   * (`NSDQ:AAPL` 形式) では起こらない。
   */
  public async getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]> {
    return this.queryAllByGsi4({
      attributeName: 'GSI4PK',
      attributeValue: buildDailySummaryGsi4Pk(exchangeId),
      sk: {
        attributeName: 'GSI4SK',
        operator: 'between' as const,
        value: [
          buildExchangeSummaryGsi4DatePrefix(fromDate),
          buildExchangeSummaryGsi4DateUpperBound(toDate),
        ],
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
      attributeValue: buildDailySummaryGsi4Pk(exchangeId),
      sk: {
        attributeName: 'GSI4SK',
        operator: 'between' as const,
        value: [
          buildExchangeSummaryGsi4DatePrefix(fromDate),
          buildExchangeSummaryGsi4DateUpperBound(toDate),
        ],
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
   * GSI4条件に一致する全アイテム (生の Item のまま) をcursorループで集約する。
   * Entity への変換方法が呼び出し側で異なる（`toEntity` / `toForecastFields`）ため、
   * 変換前の生アイテム集約だけをここに切り出す。
   */
  private queryRawByGsi4(condition: AttributeQueryCondition): DynamoDBAttributes[] {
    const items: DynamoDBAttributes[] = [];
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
   *
   * 上書きしても作成日時は最初の値を保つため、先に既存を読んで引き継ぐ。
   * updatedAt は store が書き込み時に現在時刻で上書きする。
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    const existing = await this.entityStore.get({ tickerId: input.tickerId, date: input.date });
    const now = Date.now();
    return this.entityStore.put({
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }
}
