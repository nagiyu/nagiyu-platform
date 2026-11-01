/**
 * Stock Tracker Core - InMemory MarketForecast Repository
 *
 * InMemorySingleTableStoreを使用したMarketForecastRepositoryの実装
 */
import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type {
  AppendMarketForecastOutcomeResult,
  CreateMarketForecastResult,
  MarketForecastRepository,
} from './market-forecast.repository.interface.js';
import type {
  CreateMarketForecastInput,
  MarketForecastEntity,
  MarketForecastKey,
} from '../entities/market-forecast.entity.js';
import type { Market, MarketOutcome, MarketSample } from '../forecast/index.js';
import {
  MarketForecastMapper,
  MARKET_FORECAST_OUTCOME_ATTRIBUTE,
  buildMarketForecastPk,
  buildMarketForecastSk,
  buildMarketForecastSkUpperBound,
} from '../mappers/market-forecast.mapper.js';

/**
 * InMemory MarketForecast Repository
 *
 * 単一アイテムの作成・取得・Outcome 追記は EntityStore に任せ、市場の期間クエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryMarketForecastRepository implements MarketForecastRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new MarketForecastMapper();
  private readonly entityStore: EntityStore<MarketForecastEntity, MarketForecastKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * MarketForecast を新規作成する。既に存在する場合は書き込まず、既存のアイテムを返す
   */
  public async createIfAbsent(
    input: CreateMarketForecastInput
  ): Promise<CreateMarketForecastResult> {
    const { entity, created } = await this.entityStore.createIfAbsent(input);
    return { item: entity, created };
  }

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   * (アイテムが存在し、かつ Outcome が未設定のときだけ書く)
   */
  public async appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult> {
    const { entity, updated } = await this.entityStore.updateIfAttributeAbsent(
      key,
      MARKET_FORECAST_OUTCOME_ATTRIBUTE,
      { outcome: this.mapper.toOutcomeAttribute(outcome) }
    );
    return { item: entity, updated };
  }

  /**
   * Market と Date で単一の MarketForecast を取得
   */
  public async getByMarketAndDate(
    market: Market,
    date: string
  ): Promise<MarketForecastEntity | null> {
    return this.entityStore.get({ market, date });
  }

  /**
   * 市場の MarketForecast を、期間でサンプル列として読み出す
   */
  public async getSamplesByDateRange(
    market: Market,
    fromDate?: string,
    toDate?: string
  ): Promise<MarketSample[]> {
    const pk = buildMarketForecastPk(market);
    const sk = buildSkCondition(fromDate, toDate);
    const items = this.store.queryAll({ pk, ...(sk ? { sk } : {}) });

    return items.map((item) => this.mapper.toSample(item));
  }
}

/** ベーステーブル SK（`DATE#{Date}`）の期間条件を組み立てる。両方省略時は undefined（全件） */
function buildSkCondition(
  fromDate?: string,
  toDate?: string
): { operator: 'between' | 'gte' | 'lte'; value: string | [string, string] } | undefined {
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      operator: 'between',
      value: [buildMarketForecastSk(fromDate), buildMarketForecastSkUpperBound(toDate)],
    };
  }
  if (fromDate !== undefined) {
    return { operator: 'gte', value: buildMarketForecastSk(fromDate) };
  }
  if (toDate !== undefined) {
    return { operator: 'lte', value: buildMarketForecastSkUpperBound(toDate) };
  }
  return undefined;
}
