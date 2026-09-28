/**
 * Stock Tracker Core - InMemory MarketForecast Repository
 *
 * InMemorySingleTableStoreを使用したMarketForecastRepositoryの実装
 */
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
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
import { MarketForecastMapper } from '../mappers/market-forecast.mapper.js';

// ベーステーブル PK（MARKETFORECAST#{Market}）の全件集約で store 既定の query limit（100件）
// による打ち切りを避けるため、他リポジトリと同じ流儀でcursorループを使う。
const FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory MarketForecast Repository
 *
 * InMemorySingleTableStoreを使用した確度（市場×日）リポジトリの実装
 * テスト環境で使用
 */
export class InMemoryMarketForecastRepository implements MarketForecastRepository {
  private readonly mapper: MarketForecastMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new MarketForecastMapper();
  }

  /**
   * MarketForecast を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(
    input: CreateMarketForecastInput
  ): Promise<CreateMarketForecastResult> {
    const now = Date.now();
    const item = this.mapper.toCreateItem(input, now);

    try {
      this.store.put(item, { attributeNotExists: true });
      return { item: this.mapper.toEntity(item), created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.getByMarketAndDate(input.Market, input.Date);
        if (!existing) {
          throw new Error('MarketForecast の作成に失敗しましたが、既存アイテムが見つかりません', {
            cause: error,
          });
        }
        return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * 既存 MarketForecast に採点結果（Outcome）を条件付きで追記する
   */
  public async appendOutcome(
    key: MarketForecastKey,
    outcome: MarketOutcome
  ): Promise<AppendMarketForecastOutcomeResult> {
    const existing = await this.getByMarketAndDate(key.market, key.date);
    const identifier = `${key.market}#${key.date}`;

    if (!existing) {
      throw new EntityNotFoundError('MarketForecast', identifier);
    }
    if (existing.Outcome !== undefined) {
      return { item: existing, updated: false };
    }

    const updated: MarketForecastEntity = {
      ...existing,
      Outcome: this.mapper.toOutcomeAttribute(outcome),
      UpdatedAt: Date.now(),
    };
    this.store.put(this.mapper.toItem(updated));
    return { item: updated, updated: true };
  }

  /**
   * Market と Date で単一の MarketForecast を取得
   */
  public async getByMarketAndDate(
    market: Market,
    date: string
  ): Promise<MarketForecastEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ market, date });
    const item = this.store.get(pk, sk);
    if (!item) {
      return null;
    }
    return this.mapper.toEntity(item);
  }

  /**
   * 市場の MarketForecast を、期間でサンプル列として読み出す
   */
  public async getSamplesByDateRange(
    market: Market,
    fromDate?: string,
    toDate?: string
  ): Promise<MarketSample[]> {
    const items: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    const pk = this.mapper.buildPk(market);
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
    return { operator: 'between', value: [`DATE#${fromDate}`, `DATE#${toDate}#~`] };
  }
  if (fromDate !== undefined) {
    return { operator: 'gte', value: `DATE#${fromDate}` };
  }
  if (toDate !== undefined) {
    return { operator: 'lte', value: `DATE#${toDate}#~` };
  }
  return undefined;
}
