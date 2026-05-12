/**
 * Stock Tracker Core - InMemory Daily Summary Repository
 *
 * InMemorySingleTableStoreを使用したDailySummaryRepositoryの実装
 */

import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InMemorySingleTableStore,
} from '@nagiyu/aws';
import type {
  DailySummaryEvaluationFields,
  DailySummaryRepository,
} from './daily-summary.repository.interface.js';
import type {
  DailySummaryEntity,
  DailySummaryKey,
  CreateDailySummaryInput,
} from '../entities/daily-summary.entity.js';
import { DailySummaryMapper } from '../mappers/daily-summary.mapper.js';

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
   */
  public async getByExchange(exchangeId: string, date?: string): Promise<DailySummaryEntity[]> {
    const result = this.store.queryByAttribute({
      attributeName: 'GSI4PK',
      attributeValue: exchangeId,
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

    const summaries = result.items.map((item) => this.mapper.toEntity(item));
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
   */
  public async getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]> {
    const result = this.store.queryByAttribute({
      attributeName: 'GSI4PK',
      attributeValue: exchangeId,
      sk: {
        attributeName: 'GSI4SK',
        operator: 'between' as const,
        value: [`DATE#${fromDate}`, `DATE#${toDate}#~`],
      },
    });

    return result.items.map((item) => this.mapper.toEntity(item));
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

  /**
   * 採点結果を既存 DailySummary に書き込む
   *
   * - 対象が存在しない場合は `EntityNotFoundError`
   * - 既に採点済み（`EvaluatedAt` あり）の場合は `EntityAlreadyExistsError`
   */
  public async markAsEvaluated(
    key: DailySummaryKey,
    fields: DailySummaryEvaluationFields
  ): Promise<void> {
    const existing = await this.getByTickerAndDate(key.tickerId, key.date);
    const identifier = `${key.tickerId}#${key.date}`;

    if (!existing) {
      throw new EntityNotFoundError('DailySummary', identifier);
    }
    if (existing.EvaluatedAt !== undefined) {
      throw new EntityAlreadyExistsError('DailySummaryEvaluation', identifier);
    }

    const now = Date.now();
    const updated: DailySummaryEntity = {
      ...existing,
      ...fields,
      UpdatedAt: now,
    };

    this.store.put(this.mapper.toItem(updated));
  }
}
