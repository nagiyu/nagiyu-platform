/**
 * Stock Tracker Core - InMemory MarketForecast Repository
 *
 * InMemorySingleTableStoreを使用したMarketForecastRepositoryの実装
 */
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemoryEntityStore,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
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

// ベーステーブル PK（MARKETFORECAST#{Market}）の全件集約で store 既定の query limit（100件）
// による打ち切りを避けるため、cursorループで全件集約する。
const FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory MarketForecast Repository
 *
 * 単一アイテムの作成・取得は EntityStore に任せ、条件付きの Outcome 追記と
 * 市場の期間クエリだけを自前で持つ。
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
    const now = Date.now();
    try {
      // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
      const item = await this.entityStore.create({ ...input, createdAt: now, updatedAt: now });
      return { item, created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.entityStore.get({ market: input.market, date: input.date });
        if (!existing) {
          throw new DatabaseError(
            'MarketForecast の作成に失敗しましたが、既存アイテムが見つかりません',
            error
          );
        }
        return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   * (アイテムが存在し、かつ Outcome が未設定のときだけ書く)
   *
   * 存在と Outcome の有無は、Entity に変換せず保存された Item で判定する。DynamoDB 版は
   * 条件式で判定し、読めないアイテムでも Outcome が無ければ書き込んだあとで変換に失敗するため、
   * InMemory 版もその順序に揃える。
   */
  public async appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult> {
    const stored = this.store.getByKey(this.mapper.buildKeys(key));

    if (!stored) {
      throw new EntityNotFoundError(this.mapper.entityType, `${key.market}#${key.date}`);
    }
    if (stored[MARKET_FORECAST_OUTCOME_ATTRIBUTE] !== undefined) {
      return { item: this.mapper.toEntity(stored), updated: false };
    }

    const updated = await this.entityStore.update(key, {
      outcome: this.mapper.toOutcomeAttribute(outcome),
    });
    return { item: updated, updated: true };
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
    const items: DynamoDBAttributes[] = [];
    let cursor: string | undefined;
    const pk = buildMarketForecastPk(market);
    const sk = buildSkCondition(fromDate, toDate);

    do {
      const page = this.store.query(
        { pk, ...(sk ? { sk } : {}) },
        { limit: FULL_AGGREGATION_PAGE_SIZE, cursor }
      );
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

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
