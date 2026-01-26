import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store';
import { EntityNotFoundError, EntityAlreadyExistsError } from '../../../../src/dynamodb/errors';
import type { DynamoDBItem } from '../../../../src/dynamodb/types';

describe('InMemorySingleTableStore', () => {
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
  });

  describe('基本操作', () => {
    describe('put', () => {
      it('アイテムを保存できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'Test User',
        };

        store.put(item);

        expect(store.size()).toBe(1);
      });

      it('同じキーのアイテムを上書きできる', () => {
        const item1: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'User 1',
        };

        const item2: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'User 2',
        };

        store.put(item1);
        store.put(item2);

        expect(store.size()).toBe(1);
        const result = store.get('USER#123', 'PROFILE');
        expect(result?.Name).toBe('User 2');
      });

      it('条件付き保存で既存アイテムがある場合はエラーを投げる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        };

        store.put(item);

        expect(() => {
          store.put(item, { attributeNotExists: true });
        }).toThrow(EntityAlreadyExistsError);
      });
    });

    describe('get', () => {
      it('保存したアイテムを取得できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          Name: 'Test User',
        };

        store.put(item);
        const result = store.get('USER#123', 'PROFILE');

        expect(result).toEqual(item);
      });

      it('存在しないアイテムは undefined を返す', () => {
        const result = store.get('USER#999', 'PROFILE');

        expect(result).toBeUndefined();
      });
    });

    describe('delete', () => {
      it('アイテムを削除できる', () => {
        const item: DynamoDBItem = {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        };

        store.put(item);
        store.delete('USER#123', 'PROFILE');

        expect(store.size()).toBe(0);
        expect(store.get('USER#123', 'PROFILE')).toBeUndefined();
      });

      it('条件付き削除で存在しないアイテムの場合はエラーを投げる', () => {
        expect(() => {
          store.delete('USER#999', 'PROFILE', { attributeExists: true });
        }).toThrow(EntityNotFoundError);
      });
    });
  });

  describe('クエリ操作', () => {
    beforeEach(() => {
      // テストデータを準備
      const items: DynamoDBItem[] = [
        {
          PK: 'USER#123',
          SK: 'HOLDING#AAPL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'AAPL',
        },
        {
          PK: 'USER#123',
          SK: 'HOLDING#GOOGL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'GOOGL',
        },
        {
          PK: 'USER#123',
          SK: 'HOLDING#MSFT',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'MSFT',
        },
        {
          PK: 'USER#456',
          SK: 'HOLDING#AAPL',
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
          TickerID: 'AAPL',
        },
      ];

      items.forEach((item) => store.put(item));
    });

    describe('query', () => {
      it('PKで全アイテムを取得できる', () => {
        const result = store.query({ pk: 'USER#123' });

        expect(result.items).toHaveLength(3);
        expect(result.items.every((item) => item.PK === 'USER#123')).toBe(true);
      });

      it('SKの等価条件でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'eq', value: 'HOLDING#AAPL' },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].SK).toBe('HOLDING#AAPL');
      });

      it('SKの前方一致でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'begins_with', value: 'HOLDING#' },
        });

        expect(result.items).toHaveLength(3);
      });

      it('SKの範囲条件でフィルタリングできる', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'between', value: ['HOLDING#A', 'HOLDING#H'] },
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((item) => item.TickerID).sort()).toEqual(['AAPL', 'GOOGL']);
      });

      it('SKの比較演算子でフィルタリングできる (gte)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'gte', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((item) => item.TickerID).sort()).toEqual(['GOOGL', 'MSFT']);
      });

      it('SKの比較演算子でフィルタリングできる (gt)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'gt', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(2);
      });

      it('SKの比較演算子でフィルタリングできる (lt)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'lt', value: 'HOLDING#G' },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].TickerID).toBe('AAPL');
      });

      it('SKの比較演算子でフィルタリングできる (lte)', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'lte', value: 'HOLDING#GOOGL' },
        });

        expect(result.items).toHaveLength(2);
      });

      it('不正なbetween条件（配列でない）は空の結果を返す', () => {
        const result = store.query({
          pk: 'USER#123',
          sk: { operator: 'between', value: 'INVALID' as unknown as [string, string] },
        });

        expect(result.items).toHaveLength(0);
      });
    });

    describe('queryByAttribute', () => {
      beforeEach(() => {
        // GSI用のテストデータを追加
        const items: DynamoDBItem[] = [
          {
            PK: 'USER#123',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            GSI1PK: 'TICKER#AAPL',
            GSI1SK: 'USER#123',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
          {
            PK: 'USER#456',
            SK: 'HOLDING#AAPL',
            Type: 'Holding',
            GSI1PK: 'TICKER#AAPL',
            GSI1SK: 'USER#456',
            CreatedAt: Date.now(),
            UpdatedAt: Date.now(),
            TickerID: 'AAPL',
          },
        ];

        store.clear();
        items.forEach((item) => store.put(item));
      });

      it('属性値で全アイテムを取得できる', () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI1PK',
          attributeValue: 'TICKER#AAPL',
        });

        expect(result.items).toHaveLength(2);
        expect(result.items.every((item) => item.GSI1PK === 'TICKER#AAPL')).toBe(true);
      });

      it('SKの条件でフィルタリングできる', () => {
        const result = store.queryByAttribute({
          attributeName: 'GSI1PK',
          attributeValue: 'TICKER#AAPL',
          sk: {
            attributeName: 'GSI1SK',
            operator: 'eq',
            value: 'USER#123',
          },
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].GSI1SK).toBe('USER#123');
      });
    });

    describe('scan', () => {
      it('全アイテムを取得できる', () => {
        const result = store.scan();

        expect(result.items).toHaveLength(4);
      });
    });
  });

  describe('ページネーション', () => {
    beforeEach(() => {
      // 大量のテストデータを準備
      const items: DynamoDBItem[] = [];
      for (let i = 0; i < 10; i++) {
        items.push({
          PK: 'USER#123',
          SK: `HOLDING#TICKER${i.toString().padStart(2, '0')}`,
          Type: 'Holding',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        });
      }
      items.forEach((item) => store.put(item));
    });

    it('limit で取得数を制限できる', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it('cursor で次のページを取得できる', () => {
      const firstPage = store.query({ pk: 'USER#123' }, { limit: 3 });
      const secondPage = store.query({ pk: 'USER#123' }, { limit: 3, cursor: firstPage.nextCursor });

      expect(secondPage.items).toHaveLength(3);
      expect(secondPage.items[0].SK).not.toBe(firstPage.items[0].SK);
    });

    it('最後のページでは nextCursor が undefined', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 100 });

      expect(result.items).toHaveLength(10);
      expect(result.nextCursor).toBeUndefined();
    });

    it('無効なカーソルの場合はインデックス0から開始する', () => {
      const result = store.query({ pk: 'USER#123' }, { limit: 3, cursor: 'invalid-cursor' });

      expect(result.items).toHaveLength(3);
    });

    it('queryByAttribute でもページネーションが機能する', () => {
      store.clear();
      const items: DynamoDBItem[] = [];
      for (let i = 0; i < 10; i++) {
        items.push({
          PK: `USER#${i}`,
          SK: 'PROFILE',
          Type: 'User',
          GSI1PK: 'ACTIVE',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        });
      }
      items.forEach((item) => store.put(item));

      const result = store.queryByAttribute(
        { attributeName: 'GSI1PK', attributeValue: 'ACTIVE' },
        { limit: 3 }
      );

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });

    it('scan でもページネーションが機能する', () => {
      const result = store.scan({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
    });
  });

  describe('ユーティリティ', () => {
    it('clear でストアを空にできる', () => {
      const item: DynamoDBItem = {
        PK: 'USER#123',
        SK: 'PROFILE',
        Type: 'User',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      store.put(item);
      store.clear();

      expect(store.size()).toBe(0);
    });

    it('size でアイテム数を取得できる', () => {
      expect(store.size()).toBe(0);

      const items: DynamoDBItem[] = [
        {
          PK: 'USER#123',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
        {
          PK: 'USER#456',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];

      items.forEach((item) => store.put(item));

      expect(store.size()).toBe(2);
    });
  });
});
