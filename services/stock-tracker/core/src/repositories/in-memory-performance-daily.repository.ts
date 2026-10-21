/**
 * Stock Tracker Core - InMemory PerformanceDaily Repository
 *
 * InMemorySingleTableStoreを使用したPerformanceDailyRepositoryの実装
 */
import {
  InMemoryEntityStore,
  type DynamoDBAttributes,
  type EntityStore,
  type InMemorySingleTableStore,
} from '@nagiyu/aws';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import type { PerformanceDailyKey } from '../entities/performance-daily.entity.js';
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';
import {
  PerformanceDailyMapper,
  buildPerformanceDailyPk,
  buildPerformanceDailySk,
  buildPerformanceDailySkUpperBound,
} from '../mappers/performance-daily.mapper.js';

// ベーステーブル PK（PERF#{Question}#{Market}）の全件集約で store 既定の query limit（100件）
// による打ち切りを避けるため、他リポジトリと同じ流儀でcursorループを使う。
const FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory PerformanceDaily Repository
 *
 * 単一アイテムの保存・取得は EntityStore に任せ、期間のクエリだけを自前で持つ。
 * テスト環境で使用
 */
export class InMemoryPerformanceDailyRepository implements PerformanceDailyRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new PerformanceDailyMapper();
  private readonly entityStore: EntityStore<PerformanceDailyItem, PerformanceDailyKey>;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * PerformanceDaily を保存する（既存の場合は無条件で置き換える。冪等な再計算）
   */
  public async save(item: PerformanceDailyItem): Promise<PerformanceDailyItem> {
    return this.entityStore.put(item);
  }

  /**
   * 問い・市場・日付で単一の PerformanceDaily を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<PerformanceDailyItem | null> {
    return this.entityStore.get({ question, market, date });
  }

  /**
   * 問い・市場の PerformanceDaily を、期間（fromDate 以上・toDate 以下）で取得する
   */
  public async getByPeriod(
    question: Question,
    market: Market,
    fromDate: string,
    toDate?: string
  ): Promise<PerformanceDailyItem[]> {
    const items: DynamoDBAttributes[] = [];
    let cursor: string | undefined;
    const sk =
      toDate !== undefined
        ? {
            operator: 'between' as const,
            value: [
              buildPerformanceDailySk(fromDate),
              buildPerformanceDailySkUpperBound(toDate),
            ] as [string, string],
          }
        : { operator: 'gte' as const, value: buildPerformanceDailySk(fromDate) };
    const pk = buildPerformanceDailyPk(question, market);

    do {
      const page = this.store.query({ pk, sk }, { limit: FULL_AGGREGATION_PAGE_SIZE, cursor });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    return items.map((item) => this.mapper.toEntity(item));
  }
}
