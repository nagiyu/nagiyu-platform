/**
 * Stock Tracker Core - InMemory Watchlist Repository Unit Tests
 *
 * InMemoryWatchlistRepositoryのユニットテスト
 */

import { InMemoryWatchlistRepository } from '../../../src/repositories/in-memory-watchlist.repository.js';
import {
  WatchlistAlreadyExistsError,
  WatchlistNotFoundError,
} from '../../../src/repositories/dynamodb-watchlist.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateWatchlistInput } from '../../../src/entities/watchlist.entity.js';

describe('InMemoryWatchlistRepository', () => {
  let repository: InMemoryWatchlistRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryWatchlistRepository(store);
  });

  describe('create', () => {
    it('新しいウォッチリストを作成できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
    });

    it('同じUserID/TickerIDのウォッチリストが既に存在する場合はWatchlistAlreadyExistsErrorをスローする', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(WatchlistAlreadyExistsError);
    });

    it('異なるTickerIDであれば同じUserIDで複数作成できる', async () => {
      const input1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.TickerID).toBe('NSDQ:AAPL');
      expect(result2.TickerID).toBe('NSDQ:NVDA');
    });

    it('同じTickerIDを異なるUserIDで作成できる', async () => {
      const input1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateWatchlistInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.UserID).toBe('user-123');
      expect(result2.UserID).toBe('user-456');
    });

    it('CreatedAtが自動的に設定される', async () => {
      const beforeCreate = Date.now();
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };
      const result = await repository.create(input);
      const afterCreate = Date.now();

      expect(result.CreatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.CreatedAt).toBeLessThanOrEqual(afterCreate);
    });
  });

  describe('getById', () => {
    it('存在するウォッチリストを取得できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const created = await repository.create(input);
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual(created);
    });

    it('存在しないウォッチリストを取得した場合はnullを返す', async () => {
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });

    it('異なるUserIDの場合はnullを返す', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      const result = await repository.getById('user-456', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });

    it('削除されたウォッチリストは取得できない', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      await repository.delete('user-123', 'NSDQ:AAPL');
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('ユーザーの全ウォッチリストを取得できる', async () => {
      const input1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items.map((w) => w.TickerID)).toContain('NSDQ:AAPL');
      expect(result.items.map((w) => w.TickerID)).toContain('NSDQ:NVDA');
    });

    it('他のユーザーのウォッチリストは取得されない', async () => {
      const input1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateWatchlistInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].TickerID).toBe('NSDQ:AAPL');
    });

    it('ウォッチリストが存在しない場合は空配列を返す', async () => {
      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
    });

    it('ページネーションが動作する - limit指定', async () => {
      // 5件のデータを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:TEST${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      // 最初の2件を取得
      const page1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();
    });

    it('ページネーションが動作する - cursor指定', async () => {
      // 5件のデータを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:TEST${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      // 最初の2件を取得
      const page1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      // 次の2件を取得
      const page2 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeDefined();

      // 最後の1件を取得
      const page3 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: page2.nextCursor,
      });
      expect(page3.items).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('ページネーション時に重複や欠落がない', async () => {
      // 10件のデータを作成
      const tickerIds = [];
      for (let i = 0; i < 10; i++) {
        const tickerId = `NSDQ:TEST${i}`;
        tickerIds.push(tickerId);
        await repository.create({
          UserID: 'user-123',
          TickerID: tickerId,
          ExchangeID: 'NASDAQ',
        });
      }

      // ページネーションで全件取得
      const allItems = [];
      let cursor: string | undefined;
      do {
        const page = await repository.getByUserId('user-123', {
          limit: 3,
          cursor,
        });
        allItems.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      // 全件取得できていることを確認
      expect(allItems).toHaveLength(10);
      const retrievedTickerIds = allItems.map((item) => item.TickerID);
      for (const tickerId of tickerIds) {
        expect(retrievedTickerIds).toContain(tickerId);
      }
    });

    it('削除されたウォッチリストは含まれない', async () => {
      const input1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input1);
      await repository.create(input2);
      await repository.delete('user-123', 'NSDQ:NVDA');

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].TickerID).toBe('NSDQ:AAPL');
    });
  });

  describe('delete', () => {
    it('ウォッチリストを削除できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      await repository.delete('user-123', 'NSDQ:AAPL');

      const result = await repository.getById('user-123', 'NSDQ:AAPL');
      expect(result).toBeNull();
    });

    it('存在しないウォッチリストを削除しようとした場合はWatchlistNotFoundErrorをスローする', async () => {
      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        WatchlistNotFoundError
      );
    });

    it('削除後、同じUserID/TickerIDで再度作成できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      await repository.delete('user-123', 'NSDQ:AAPL');
      const recreated = await repository.create(input);

      expect(recreated.UserID).toBe('user-123');
      expect(recreated.TickerID).toBe('NSDQ:AAPL');
    });

    it('異なるUserIDのウォッチリストは削除できない', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.delete('user-456', 'NSDQ:AAPL')).rejects.toThrow(
        WatchlistNotFoundError
      );
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryWatchlistRepository(store);

      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      const result = await repository2.getById('user-123', 'NSDQ:AAPL');

      expect(result).not.toBeNull();
      expect(result?.TickerID).toBe('NSDQ:AAPL');
    });

    it('異なるリポジトリで削除した内容が反映される', async () => {
      const repository2 = new InMemoryWatchlistRepository(store);

      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      await repository2.delete('user-123', 'NSDQ:AAPL');
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });
  });

  describe('エッジケース', () => {
    it('特殊文字を含むTickerIDを作成できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'SPECIAL:TICKER#123',
        ExchangeID: 'NASDAQ',
      };

      const result = await repository.create(input);

      expect(result.TickerID).toBe('SPECIAL:TICKER#123');
    });

    it('長いUserIDでも動作する', async () => {
      const longUserId = 'user-' + 'a'.repeat(200);
      const input: CreateWatchlistInput = {
        UserID: longUserId,
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const result = await repository.create(input);

      expect(result.UserID).toBe(longUserId);
    });

    it('多数のウォッチリストを作成・取得できる', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          repository.create({
            UserID: 'user-123',
            TickerID: `NSDQ:TEST${i}`,
            ExchangeID: 'NASDAQ',
          })
        );
      }
      await Promise.all(promises);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(100);
    });

    it('複数ユーザーのウォッチリストが混在しても正しく取得できる', async () => {
      // user-123 のウォッチリスト
      for (let i = 0; i < 3; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:AAPL${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      // user-456 のウォッチリスト
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-456',
          TickerID: `NSDQ:NVDA${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      const result123 = await repository.getByUserId('user-123');
      const result456 = await repository.getByUserId('user-456');

      expect(result123.items).toHaveLength(3);
      expect(result456.items).toHaveLength(5);

      // user-123のウォッチリストにuser-456のデータが含まれていないことを確認
      for (const item of result123.items) {
        expect(item.UserID).toBe('user-123');
      }
    });

    it('空のExchangeIDでも保存できる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: '',
      };

      const result = await repository.create(input);

      expect(result.ExchangeID).toBe('');
    });
  });

  describe('エラーメッセージの検証', () => {
    it('WatchlistAlreadyExistsErrorに正しいメッセージが含まれる', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      try {
        await repository.create(input);
        fail('例外がスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(WatchlistAlreadyExistsError);
        expect((error as Error).message).toContain('user-123');
        expect((error as Error).message).toContain('NSDQ:AAPL');
      }
    });

    it('WatchlistNotFoundErrorに正しいメッセージが含まれる', async () => {
      try {
        await repository.delete('user-123', 'NSDQ:AAPL');
        fail('例外がスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(WatchlistNotFoundError);
        expect((error as Error).message).toContain('user-123');
        expect((error as Error).message).toContain('NSDQ:AAPL');
      }
    });
  });
});
