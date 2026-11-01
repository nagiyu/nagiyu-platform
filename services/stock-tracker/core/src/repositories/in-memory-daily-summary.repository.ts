/**
 * Stock Tracker Core - InMemory Daily Summary Repository
 *
 * InMemorySingleTableStoreを使用したDailySummaryRepositoryの実装
 */

import {
  InMemoryEntityStore,
  type AttributeQueryCondition,
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
   * queryAllByGsi4で全件を取得してから最新日を判定する（date省略時）。
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
    const items = this.store.queryAllByAttribute({
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
   * GSI4条件に一致する全アイテムを取得し、Entityへ変換して返す。
   * getByExchange / getByExchangeAndDateRangeはこのヘルパーを経由する。
   */
  private queryAllByGsi4(condition: AttributeQueryCondition): DailySummaryEntity[] {
    return this.store.queryAllByAttribute(condition).map((item) => this.mapper.toEntity(item));
  }

  /**
   * サマリーを保存（既存の場合は上書き）
   *
   * 上書きしても作成日時は最初の値を保つため、先に既存を読んで引き継ぐ。
   */
  public async upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity> {
    const existing = await this.entityStore.get({ tickerId: input.tickerId, date: input.date });
    return this.entityStore.put({ ...input, createdAt: existing?.createdAt });
  }
}
