/**
 * Stock Tracker Core - InMemory PerformanceDaily Repository
 *
 * InMemorySingleTableStoreを使用したPerformanceDailyRepositoryの実装
 */
import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { PerformanceDailyRepository } from './performance-daily.repository.interface.js';
import type { PerformanceDailyKey } from '../entities/performance-daily.entity.js';
import type { Market, PerformanceDailyItem, Question } from '../forecast/index.js';
import {
  PerformanceDailyMapper,
  buildPerformanceDailyPk,
  buildPerformanceDailySk,
  buildPerformanceDailySkUpperBound,
} from '../mappers/performance-daily.mapper.js';

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

    const items = this.store.queryAll({ pk, sk });

    return items.map((item) => this.mapper.toEntity(item));
  }
}
