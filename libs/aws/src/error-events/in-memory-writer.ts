/**
 * in-memory 実装の ErrorEventWriter
 *
 * テスト・ローカル開発用。永続化は行わずプロセスメモリ上に保持する。
 */

import type { ErrorEvent } from '@nagiyu/common';
import { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';
import type { EntityStore } from '../dynamodb/store/entity-store.interface.js';
import { InMemoryEntityStore } from '../dynamodb/store/in-memory-entity-store.js';
import { ErrorEventMapper } from './mapper.js';
import { assertWritableErrorEvent } from './validation.js';
import type { ErrorEventKey, ErrorEventWriter } from './writer.js';

/**
 * in-memory 実装。
 *
 * `getRecords()` で書き込まれたイベントを参照でき、
 * テストで書き込み内容のアサーションに使用する。
 */
export class InMemoryErrorEventWriter implements ErrorEventWriter {
  private readonly store: InMemorySingleTableStore;
  private readonly mapper = new ErrorEventMapper();
  private readonly entityStore: EntityStore<ErrorEvent, ErrorEventKey>;
  private readonly records: ErrorEvent[] = [];

  /**
   * @param store - 共有するストア。読み取り側と同じストアを渡すと、書いた内容がそのまま読める
   */
  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async put(event: ErrorEvent): Promise<void> {
    assertWritableErrorEvent(event);
    this.records.push(await this.entityStore.create(event));
  }

  /**
   * 書き込まれたイベントの一覧（書き込み順）を取得する。テスト用。
   */
  public getRecords(): readonly ErrorEvent[] {
    return [...this.records];
  }

  /**
   * このライターが書いたイベントを削除し、記録をクリアする。テスト用。
   * 共有ストア上の他の Item には触れない。
   */
  public reset(): void {
    for (const record of this.records) {
      this.store.deleteByKey(this.mapper.buildKeys(this.mapper.getKey(record)));
    }
    this.records.length = 0;
  }
}
