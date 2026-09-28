/**
 * Stock Tracker Core - InMemory Forecast Repository
 *
 * InMemorySingleTableStoreを使用したForecastRepositoryの実装
 */
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type {
  AppendForecastOutcomeResult,
  CreateForecastResult,
  ForecastRepository,
} from './forecast.repository.interface.js';
import type {
  CreateForecastInput,
  ForecastEntity,
  ForecastKey,
} from '../entities/forecast.entity.js';
import type { TickerOutcome, TickerSample } from '../forecast/index.js';
import { ForecastMapper } from '../mappers/forecast.mapper.js';

// GSI4 の全件集約（getByExchangeAndDate・サンプル読み出し）で store 既定の queryByAttribute
// limit（100件）による打ち切りを避けるため、daily-summary と同じ流儀でcursorループを使う。
const GSI4_FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory Forecast Repository
 *
 * InMemorySingleTableStoreを使用した確度（銘柄×日）リポジトリの実装
 * テスト環境で使用
 */
export class InMemoryForecastRepository implements ForecastRepository {
  private readonly mapper: ForecastMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new ForecastMapper();
  }

  /**
   * Forecast を条件付きで新規作成する（`attribute_not_exists(PK)`）
   */
  public async createIfAbsent(input: CreateForecastInput): Promise<CreateForecastResult> {
    const now = Date.now();
    const item = this.mapper.toCreateItem(input, now);

    try {
      this.store.put(item, { attributeNotExists: true });
      return { item: this.mapper.toEntity(item), created: true };
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        const existing = await this.getByTickerAndDate(input.TickerID, input.Date);
        if (!existing) {
          throw new Error('Forecast の作成に失敗しましたが、既存アイテムが見つかりません', {
            cause: error,
          });
        }
        return { item: existing, created: false };
      }
      throw error;
    }
  }

  /**
   * 既存 Forecast に採点結果（Outcome）を条件付きで追記する
   */
  public async appendOutcome(
    key: ForecastKey,
    outcome: TickerOutcome
  ): Promise<AppendForecastOutcomeResult> {
    const existing = await this.getByTickerAndDate(key.tickerId, key.date);
    const identifier = `${key.tickerId}#${key.date}`;

    if (!existing) {
      throw new EntityNotFoundError('Forecast', identifier);
    }
    if (existing.Outcome !== undefined) {
      return { item: existing, updated: false };
    }

    const updated: ForecastEntity = {
      ...existing,
      Outcome: this.mapper.toOutcomeAttribute(outcome),
      UpdatedAt: Date.now(),
    };
    this.store.put(this.mapper.toItem(updated));
    return { item: updated, updated: true };
  }

  /**
   * TickerID と Date で単一の Forecast を取得
   */
  public async getByTickerAndDate(tickerId: string, date: string): Promise<ForecastEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ tickerId, date });
    const item = this.store.get(pk, sk);
    if (!item) {
      return null;
    }
    return this.mapper.toEntity(item);
  }

  /**
   * 取引所IDと Date で同一取引所・同一日の Forecast 一覧を取得（GSI4 をシミュレート）
   */
  public async getByExchangeAndDate(exchangeId: string, date: string): Promise<ForecastEntity[]> {
    const items = this.queryAllByGsi4(exchangeId, `DATE#${date}`);
    return items.map((item) => this.mapper.toEntity(item));
  }

  /**
   * 複数の取引所の Forecast を、期間でサンプル列として読み出す
   */
  public async getSamplesByExchangesAndDateRange(
    exchangeIds: readonly string[],
    fromDate?: string,
    toDate?: string
  ): Promise<TickerSample[]> {
    const samples: TickerSample[] = [];
    for (const exchangeId of exchangeIds) {
      const items = this.queryAllByGsi4(exchangeId, undefined, fromDate, toDate);
      samples.push(...items.map((item) => this.mapper.toSample(item)));
    }
    return samples;
  }

  /**
   * GSI4（`FORECAST#{ExchangeID}` パーティション）の全件を cursor ループで集約する。
   * `datePrefix` を渡すと begins_with、`fromDate`/`toDate` を渡すと between/以上 で絞り込む
   * （いずれも省略時はパーティション全件）。
   */
  private queryAllByGsi4(
    exchangeId: string,
    datePrefix?: string,
    fromDate?: string,
    toDate?: string
  ): DynamoDBItem[] {
    const items: DynamoDBItem[] = [];
    let cursor: string | undefined;
    const sk = buildSkCondition(datePrefix, fromDate, toDate);

    do {
      const page = this.store.queryByAttribute(
        {
          attributeName: 'GSI4PK',
          attributeValue: this.mapper.buildGsi4Pk(exchangeId),
          gsiSortKeyAttributeName: 'GSI4SK',
          ...(sk ? { sk } : {}),
        },
        { limit: GSI4_FULL_AGGREGATION_PAGE_SIZE, cursor }
      );
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    return items;
  }
}

/** GSI4SK の条件（begins_with / between / 以上 / 以下）を組み立てる。全条件省略時は undefined（全件） */
function buildSkCondition(
  datePrefix?: string,
  fromDate?: string,
  toDate?: string
):
  | {
      attributeName: string;
      operator: 'begins_with' | 'between' | 'gte' | 'lte';
      value: string | [string, string];
    }
  | undefined {
  if (datePrefix !== undefined) {
    return { attributeName: 'GSI4SK', operator: 'begins_with', value: datePrefix };
  }
  if (fromDate !== undefined && toDate !== undefined) {
    return {
      attributeName: 'GSI4SK',
      operator: 'between',
      value: [`DATE#${fromDate}`, `DATE#${toDate}#~`],
    };
  }
  if (fromDate !== undefined) {
    return { attributeName: 'GSI4SK', operator: 'gte', value: `DATE#${fromDate}` };
  }
  if (toDate !== undefined) {
    return { attributeName: 'GSI4SK', operator: 'lte', value: `DATE#${toDate}#~` };
  }
  return undefined;
}
