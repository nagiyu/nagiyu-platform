/**
 * InMemory Store Singleton のテスト
 */

import { getInMemoryStore, clearInMemoryStore } from '../../../src/repositories/store';
import { InMemorySingleTableStore } from '@nagiyu/aws';

describe('InMemory Store Singleton', () => {
  afterEach(() => {
    // テスト後にストアをクリア
    clearInMemoryStore();
  });

  describe('getInMemoryStore', () => {
    it('InMemorySingleTableStore のインスタンスを返す', () => {
      const store = getInMemoryStore();
      expect(store).toBeInstanceOf(InMemorySingleTableStore);
    });

    it('複数回呼び出しても同じインスタンスを返す（シングルトン）', () => {
      const store1 = getInMemoryStore();
      const store2 = getInMemoryStore();
      
      expect(store1).toBe(store2);
    });

    it('ストアにアイテムを保存すると、別の呼び出しでも同じアイテムが取得できる', () => {
      const store1 = getInMemoryStore();
      store1.put({
        PK: 'TEST#1',
        SK: 'ITEM#1',
        Type: 'Test',
        data: 'test-data',
      });

      const store2 = getInMemoryStore();
      const item = store2.get('TEST#1', 'ITEM#1');
      
      expect(item).toBeDefined();
      expect(item?.data).toBe('test-data');
    });
  });

  describe('clearInMemoryStore', () => {
    it('ストアをクリアできる', () => {
      const store = getInMemoryStore();
      store.put({
        PK: 'TEST#1',
        SK: 'ITEM#1',
        Type: 'Test',
        data: 'test-data',
      });
      
      expect(store.size()).toBe(1);
      
      clearInMemoryStore();
      
      // 新しいストアインスタンスが作成される
      const newStore = getInMemoryStore();
      expect(newStore.size()).toBe(0);
    });

    it('クリア後に新しいインスタンスが作成される', () => {
      const store1 = getInMemoryStore();
      store1.put({
        PK: 'TEST#1',
        SK: 'ITEM#1',
        Type: 'Test',
        data: 'test-data',
      });

      clearInMemoryStore();
      
      const store2 = getInMemoryStore();
      
      // 新しいインスタンスは空
      expect(store2.size()).toBe(0);
      // 以前のデータは取得できない
      expect(store2.get('TEST#1', 'ITEM#1')).toBeUndefined();
    });
  });
});
