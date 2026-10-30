/**
 * in-memory 実装の ErrorEventReader
 *
 * テスト・ローカル開発用。DynamoDB 版と同じ mapper で Item を読み、発生時刻の降順で返す。
 */

import type { ErrorEvent } from '@nagiyu/common';
import {
  ErrorEventMapper,
  ERROR_EVENT_GSI1_PK,
  InMemoryEntityStore,
  InMemorySingleTableStore,
  buildErrorEventPK,
  type EntityStore,
  type ErrorEventKey,
} from '@nagiyu/aws';
import {
  assertValidRange,
  normalizeLimit,
  type ErrorEventReader,
  type ListErrorEventsQuery,
  type ListErrorEventsResult,
} from './reader.js';

/**
 * in-memory 実装。
 *
 * `put` で書き込みできるテスト用ヘルパーを兼ねており、
 * Reader / Writer の両方として使える簡易ストア。
 */
export class InMemoryErrorEventReader implements ErrorEventReader {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new ErrorEventMapper();
  private readonly entityStore: EntityStore<ErrorEvent, ErrorEventKey>;

  /**
   * @param store - 共有するストア。`InMemoryErrorEventWriter` と同じストアを渡すと、書いた内容を読める
   */
  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  /**
   * テスト用に 1 件追加する。
   */
  public put(event: ErrorEvent): void {
    this.store.putByKey(
      this.mapper.buildKeys(this.mapper.getKey(event)),
      this.mapper.toItem(event)
    );
  }

  /**
   * ストアを空にする。テスト用。
   */
  public reset(): void {
    this.store.clear();
  }

  public async list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult> {
    assertValidRange(query);
    const limit = normalizeLimit(query.limit);
    const fromMillis = query.from ? Date.parse(query.from) : undefined;
    const toMillis = query.to ? Date.parse(query.to) : undefined;

    const items = this.store.queryAllByAttribute({
      attributeName: 'GSI1PK',
      attributeValue: ERROR_EVENT_GSI1_PK,
      gsiSortKeyAttributeName: 'GSI1SK',
    });

    const partitionKey = query.serviceId ? buildErrorEventPK(query.serviceId) : undefined;
    const matched = items
      .filter((item) => partitionKey === undefined || item.PK === partitionKey)
      .map((item) => ({ sortKey: String(item.SK), event: this.mapper.toEntity(item) }))
      .filter(
        ({ event }) =>
          (fromMillis === undefined || event.occurredAt >= fromMillis) &&
          (toMillis === undefined || event.occurredAt <= toMillis)
      )
      // DynamoDB 版は SK の降順で返すため、同時刻の並びも SK に揃える
      .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));

    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const page = matched.slice(start, start + limit);
    // 実 DynamoDB は Limit 件を評価した時点で LastEvaluatedKey を返すため、ちょうど limit 件で終わるときも cursor が付く
    const nextCursor = page.length === limit ? String(start + page.length) : null;

    return { items: page.map(({ event }) => event), nextCursor };
  }

  public async findById(
    eventId: string,
    occurredAt: number,
    serviceId: string
  ): Promise<ErrorEvent | null> {
    return this.entityStore.get({ serviceId, occurredAt, eventId });
  }
}
