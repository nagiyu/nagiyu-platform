/**
 * in-memory 実装の ErrorEventWriter
 *
 * テスト・ローカル開発用。永続化は行わずプロセスメモリ上に保持する。
 */

import type { ErrorEvent } from '@nagiyu/common';
import type { ErrorEventWriter } from './writer.js';

/**
 * in-memory 実装。
 *
 * `getRecords()` で書き込まれたイベントを参照でき、
 * テストで書き込み内容のアサーションに使用する。
 */
export class InMemoryErrorEventWriter implements ErrorEventWriter {
  private readonly records: ErrorEvent[] = [];

  public async put(event: ErrorEvent): Promise<void> {
    this.records.push({ ...event });
  }

  /**
   * 書き込まれたイベントの一覧（書き込み順）を取得する。テスト用。
   */
  public getRecords(): readonly ErrorEvent[] {
    return [...this.records];
  }

  /**
   * 内部状態をクリアする。テスト用。
   */
  public reset(): void {
    this.records.length = 0;
  }
}
