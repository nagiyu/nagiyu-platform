/**
 * in-memory 実装の ErrorEventReader
 *
 * テスト・ローカル開発用。put した順に保持し、occurredAt で降順ソートして返す。
 */

import type { ErrorEvent } from '@nagiyu/common';
import {
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
  private readonly records: ErrorEvent[] = [];

  /**
   * テスト用に 1 件追加する。
   */
  public put(event: ErrorEvent): void {
    this.records.push({ ...event });
  }

  public reset(): void {
    this.records.length = 0;
  }

  public async list(query: ListErrorEventsQuery): Promise<ListErrorEventsResult> {
    const limit = normalizeLimit(query.limit);

    let filtered = [...this.records];

    if (query.serviceId) {
      filtered = filtered.filter((e) => e.serviceId === query.serviceId);
    }
    if (query.from) {
      filtered = filtered.filter((e) => e.occurredAt >= query.from!);
    }
    if (query.to) {
      filtered = filtered.filter((e) => e.occurredAt <= query.to!);
    }

    filtered.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;
    const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const sliced = filtered.slice(start, start + limit);
    const nextOffset = start + sliced.length;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return { items: sliced, nextCursor };
  }

  public async findById(
    eventId: string,
    occurredAt: string,
    serviceId: string
  ): Promise<ErrorEvent | null> {
    return (
      this.records.find(
        (e) => e.eventId === eventId && e.occurredAt === occurredAt && e.serviceId === serviceId
      ) ?? null
    );
  }
}
