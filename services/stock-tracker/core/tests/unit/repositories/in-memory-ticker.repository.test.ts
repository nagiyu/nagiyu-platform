/**
 * Stock Tracker Core - InMemory Ticker Repository Unit Tests
 *
 * InMemoryTickerRepositoryのユニットテスト
 */

import { InMemoryTickerRepository } from '../../../src/repositories/in-memory-ticker.repository.js';
import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  DatabaseError,
} from '@nagiyu/aws';
import type { CreateTickerInput } from '../../../src/entities/ticker.entity.js';

describe('InMemoryTickerRepository', () => {
  let repository: InMemoryTickerRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryTickerRepository(store);
  });

  describe('create', () => {
    it('新しいティッカーを作成できる', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
    });

    it('同じTickerIDのティッカーが既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('異なるTickerIDで複数作成できる', async () => {
      const input1: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const input2: CreateTickerInput = {
        TickerID: 'NSDQ:NVDA',
        Symbol: 'NVDA',
        Name: 'NVIDIA Corporation',
        ExchangeID: 'NASDAQ',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.TickerID).toBe('NSDQ:AAPL');
      expect(result2.TickerID).toBe('NSDQ:NVDA');
    });
  });

  describe('getById', () => {
    it('存在するティッカーを取得できる', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const created = await repository.create(input);
      const result = await repository.getById('NSDQ:AAPL');

      expect(result).toEqual(created);
    });

    it('存在しないティッカーの場合はnullを返す', async () => {
      const result = await repository.getById('NSDQ:NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('getByExchange', () => {
    it('取引所ごとのティッカー一覧を取得できる', async () => {
      const ticker1: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      const ticker2: CreateTickerInput = {
        TickerID: 'NSDQ:NVDA',
        Symbol: 'NVDA',
        Name: 'NVIDIA Corporation',
        ExchangeID: 'NASDAQ',
      };

      const ticker3: CreateTickerInput = {
        TickerID: 'NYSE:IBM',
        Symbol: 'IBM',
        Name: 'IBM',
        ExchangeID: 'NYSE',
      };

      await repository.create(ticker1);
      await repository.create(ticker2);
      await repository.create(ticker3);

      const nasdaqResult = await repository.getByExchange('NASDAQ');

      expect(nasdaqResult.items).toHaveLength(2);
      expect(nasdaqResult.items[0].ExchangeID).toBe('NASDAQ');
      expect(nasdaqResult.items[1].ExchangeID).toBe('NASDAQ');
    });

    it('該当する取引所のティッカーがない場合は空配列を返す', async () => {
      const result = await repository.getByExchange('UNKNOWN');

      expect(result.items).toHaveLength(0);
    });

    it('ページネーションオプションが機能する', async () => {
      // 複数のティッカーを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          TickerID: `NSDQ:TEST${i}`,
          Symbol: `TEST${i}`,
          Name: `Test ${i}`,
          ExchangeID: 'NASDAQ',
        });
      }

      const result1 = await repository.getByExchange('NASDAQ', { limit: 2 });
      expect(result1.items).toHaveLength(2);
      expect(result1.nextCursor).toBeDefined();

      const result2 = await repository.getByExchange('NASDAQ', {
        limit: 2,
        cursor: result1.nextCursor,
      });
      expect(result2.items).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('全てのティッカーを取得できる', async () => {
      await repository.create({
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      });

      await repository.create({
        TickerID: 'NYSE:IBM',
        Symbol: 'IBM',
        Name: 'IBM',
        ExchangeID: 'NYSE',
      });

      const result = await repository.getAll();

      expect(result.items).toHaveLength(2);
    });

    it('ティッカーがない場合は空配列を返す', async () => {
      const result = await repository.getAll();

      expect(result.items).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('ティッカーを更新できる', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await repository.update('NSDQ:AAPL', {
        Name: 'Apple Inc. (Updated)',
      });

      expect(result.Name).toBe('Apple Inc. (Updated)');
      expect(result.Symbol).toBe('AAPL'); // 更新されていないフィールド
      expect(result.UpdatedAt).toBeGreaterThan(result.CreatedAt);
    });

    it('存在しないティッカーを更新しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(repository.update('NSDQ:NOTFOUND', { Name: 'Updated' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新するフィールドがない場合はDatabaseErrorをスローする', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.update('NSDQ:AAPL', {})).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('ティッカーを削除できる', async () => {
      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);
      await repository.delete('NSDQ:AAPL');

      const result = await repository.getById('NSDQ:AAPL');
      expect(result).toBeNull();
    });

    it('存在しないティッカーを削除しようとするとEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('NSDQ:NOTFOUND')).rejects.toThrow(EntityNotFoundError);
    });

    it('削除時に予期しないエラーが発生した場合は再スローする', async () => {
      const unexpectedError = new Error('Unexpected store error');
      jest.spyOn(store, 'delete').mockImplementationOnce(() => {
        throw unexpectedError;
      });

      const input: CreateTickerInput = {
        TickerID: 'NSDQ:AAPL',
        Symbol: 'AAPL',
        Name: 'Apple Inc.',
        ExchangeID: 'NASDAQ',
      };

      await repository.create(input);

      await expect(repository.delete('NSDQ:AAPL')).rejects.toThrow('Unexpected store error');
    });
  });
});
