/**
 * InMemory エラーイベント共有ストアの単体テスト
 */

import {
  getInMemoryErrorEventStore,
  resetInMemoryErrorEventStore,
} from '../../../src/error-events/in-memory-store.js';

describe('InMemory エラーイベント共有ストア', () => {
  afterEach(() => {
    resetInMemoryErrorEventStore();
  });

  it('何度取得しても同じストアを返す', () => {
    expect(getInMemoryErrorEventStore()).toBe(getInMemoryErrorEventStore());
  });

  it('破棄すると次の取得で新しい空のストアを返す', () => {
    const first = getInMemoryErrorEventStore();
    first.putByKey({ PK: 'a', SK: 'b' }, { PK: 'a', SK: 'b' });

    resetInMemoryErrorEventStore();

    const second = getInMemoryErrorEventStore();
    expect(second).not.toBe(first);
    expect(second.size()).toBe(0);
  });
});
