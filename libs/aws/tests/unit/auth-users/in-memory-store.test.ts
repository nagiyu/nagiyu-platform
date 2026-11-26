/**
 * auth ユーザーの in-memory 共有ストアの単体テスト
 */

import {
  getInMemoryAuthUserStore,
  resetInMemoryAuthUserStore,
} from '../../../src/auth-users/in-memory-store.js';

describe('in-memory auth user store', () => {
  afterEach(() => resetInMemoryAuthUserStore());

  it('同じストアを返し、reset で空のストアに戻る', () => {
    const store = getInMemoryAuthUserStore();
    store.putByKey({ userId: 'u1' }, { userId: 'u1' });

    expect(getInMemoryAuthUserStore()).toBe(store);

    resetInMemoryAuthUserStore();
    expect(getInMemoryAuthUserStore()).not.toBe(store);
    expect(getInMemoryAuthUserStore().getByKey({ userId: 'u1' })).toBeUndefined();
  });
});
