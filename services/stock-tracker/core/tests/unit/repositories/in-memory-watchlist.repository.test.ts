/**
 * Stock Tracker Core - InMemory Watchlist Repository Unit Tests
 *
 * InMemoryWatchlistRepositoryのユニットテスト
 */

import { InMemoryWatchlistRepository } from '../../../src/repositories/in-memory-watchlist.repository.js';
import { InMemorySingleTableStore, EntityAlreadyExistsError } from '@nagiyu/aws';
import {
  WatchlistAlreadyExistsError,
  WatchlistNotFoundError,
} from '../../../src/repositories/dynamodb-watchlist.repository.js';
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

    it('同じユーザーとティッカーのウォッチリストを作成しようとするとWatchlistAlreadyExistsErrorをスローする', async () => {
      const input: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(WatchlistAlreadyExistsError);
    });

    it('同じユーザーで異なるティッカーのウォッチリストを作成できる', async () => {
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

    it('存在しないウォッチリストの場合はnullを返す', async () => {
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('ユーザーのウォッチリスト一覧を取得できる', async () => {
      const watchlist1: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      const watchlist2: CreateWatchlistInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
      };

      const watchlist3: CreateWatchlistInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(watchlist1);
      await repository.create(watchlist2);
      await repository.create(watchlist3);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].UserID).toBe('user-123');
      expect(result.items[1].UserID).toBe('user-123');
    });

    it('該当するユーザーのウォッチリストがない場合は空配列を返す', async () => {
      const result = await repository.getByUserId('user-notfound');

      expect(result.items).toHaveLength(0);
    });

    it('ページネーションオプションが機能する', async () => {
      // 複数のウォッチリストを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:TEST${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      const result1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(result1.items).toHaveLength(2);
      expect(result1.nextCursor).toBeDefined();

      const result2 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: result1.nextCursor,
      });
      expect(result2.items).toHaveLength(2);
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

    it('存在しないウォッチリストを削除しようとするとWatchlistNotFoundErrorをスローする', async () => {
      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        WatchlistNotFoundError
      );
    });
  });
});
