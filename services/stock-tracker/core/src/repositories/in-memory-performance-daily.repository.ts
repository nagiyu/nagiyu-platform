/**
 * Stock Tracker Core - InMemory PerformanceDaily Repository
 *
 * InMemorySingleTableStoreを使用したPerformanceDailyRepositoryの実装
 */
import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';
import { PerformanceDailyMapper } from '../mappers/performance-daily.mapper.js';

// ベーステーブル PK（PERF#{Question}#{Market}）の全件集約で store 既定の query limit（100件）
// による打ち切りを避けるため、他リポジトリと同じ流儀でcursorループを使う。
const FULL_AGGREGATION_PAGE_SIZE = 100;

/**
 * InMemory PerformanceDaily Repository
 *
 * InMemorySingleTableStoreを使用した予測日ごとの採点済み件数の集計リポジトリの実装
 * テスト環境で使用
 */
export class InMemoryPerformanceDailyRepository implements PerformanceDailyRepository {
  private readonly mapper: PerformanceDailyMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new PerformanceDailyMapper();
  }

  /**
   * PerformanceDaily を保存する（既存の場合は無条件で置き換える。冪等な再計算）
   */
  public async save(item: PerformanceDailyItem): Promise<PerformanceDailyItem> {
    this.store.put(this.mapper.toItem(item));
    return item;
  }

  /**
   * 問い・市場・日付で単一の PerformanceDaily を取得
   */
  public async getByDate(
    question: Question,
    market: Market,
    date: string
  ): Promise<PerformanceDailyItem | null> {
    const { pk, sk } = this.mapper.buildKeys({ question, market, date });
    const item = this.store.get(pk, sk);
    if (!item) {
      return null;
    }
    return this.mapper.toEntity(item);
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
    const { pk } = this.mapper.buildKeys({ question, market, date: fromDate });
    const items: DynamoDBItem[] = [];
    let cursor: string | undefined;
    const sk =
      toDate !== undefined
        ? {
            operator: 'between' as const,
            value: [`DATE#${fromDate}`, `DATE#${toDate}#~`] as [string, string],
          }
        : { operator: 'gte' as const, value: `DATE#${fromDate}` };

    do {
      const page = this.store.query({ pk, sk }, { limit: FULL_AGGREGATION_PAGE_SIZE, cursor });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    return items.map((item) => this.mapper.toEntity(item));
  }
}
