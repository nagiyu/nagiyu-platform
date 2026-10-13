/**
 * Stock Tracker Core - InMemory Ticker Repository Unit Tests
 *
 * InMemoryTickerRepositoryのユニットテスト
 */

import { InMemoryTickerRepository } from '../../../src/repositories/in-memory-ticker.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateTickerInput } from '../../../src/entities/ticker.entity.js';

const ITEMS_EXCEEDING_DEFAULT_LIMIT = 120;

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
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      // updatedAt は EntityStore が書き込み時に採番するため、createdAt と同一ミリ秒とは限らない
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);
    });

    it('異なるTickerIDで複数作成できる', async () => {
      const input1: CreateTickerInput = {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      };

      const input2: CreateTickerInput = {
        tickerId: 'NSDQ:NVDA',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        exchangeId: 'NASDAQ',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.tickerId).toBe('NSDQ:AAPL');
      expect(result2.tickerId).toBe('NSDQ:NVDA');
    });
  });

  describe('getById', () => {
    it('存在するティッカーを取得できる', async () => {
      const input: CreateTickerInput = {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
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
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      };

      const ticker2: CreateTickerInput = {
        tickerId: 'NSDQ:NVDA',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        exchangeId: 'NASDAQ',
      };

      const ticker3: CreateTickerInput = {
        tickerId: 'NYSE:IBM',
        symbol: 'IBM',
        name: 'IBM',
        exchangeId: 'NYSE',
      };

      await repository.create(ticker1);
      await repository.create(ticker2);
      await repository.create(ticker3);

      const nasdaqResult = await repository.getByExchange('NASDAQ');

      expect(nasdaqResult).toHaveLength(2);
      expect(nasdaqResult[0].exchangeId).toBe('NASDAQ');
      expect(nasdaqResult[1].exchangeId).toBe('NASDAQ');
    });

    it('該当する取引所のティッカーがない場合は空配列を返す', async () => {
      const result = await repository.getByExchange('UNKNOWN');

      expect(result).toHaveLength(0);
    });

    it('101件以上のティッカーでも内部ページを辿り切って全件返す（Issue #3788: 打ち切り防止）', async () => {
      const total = 130;
      for (let i = 0; i < total; i += 1) {
        await repository.create({
          tickerId: `NSDQ:T${String(i).padStart(4, '0')}`,
          symbol: `T${String(i).padStart(4, '0')}`,
          name: `Test ${i}`,
          exchangeId: 'NASDAQ',
        });
      }

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toHaveLength(total);
    });
  });

  describe('getAll', () => {
    it('全てのティッカーを取得できる', async () => {
      await repository.create({
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      });

      await repository.create({
        tickerId: 'NYSE:IBM',
        symbol: 'IBM',
        name: 'IBM',
        exchangeId: 'NYSE',
      });

      const result = await repository.getAll();

      expect(result.items).toHaveLength(2);
    });

    it('ティッカーがない場合は空配列を返す', async () => {
      const result = await repository.getAll();

      expect(result.items).toHaveLength(0);
    });

    it('options未指定時は100件を超えていても全件を返す', async () => {
      const totalCount = ITEMS_EXCEEDING_DEFAULT_LIMIT;
      for (let i = 0; i < totalCount; i++) {
        await repository.create({
          tickerId: `NSDQ:TEST${i}`,
          symbol: `TEST${i}`,
          name: `Test ${i}`,
          exchangeId: 'NASDAQ',
        });
      }

      const result = await repository.getAll();

      expect(result.items).toHaveLength(totalCount);
      expect(result.count).toBe(totalCount);
      expect(result.nextCursor).toBeUndefined();
    });

    it('options指定時はページネーションを維持する', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create({
          tickerId: `NSDQ:PAGED${i}`,
          symbol: `PAGED${i}`,
          name: `Paged ${i}`,
          exchangeId: 'NASDAQ',
        });
      }

      const firstPage = await repository.getAll({ limit: 2 });
      const secondPage = await repository.getAll({ limit: 2, cursor: firstPage.nextCursor });

      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).toBeDefined();
      expect(secondPage.items).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('ティッカーを更新できる', async () => {
      const input: CreateTickerInput = {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      };

      await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await repository.update('NSDQ:AAPL', {
        name: 'Apple Inc. (Updated)',
      });

      expect(result.name).toBe('Apple Inc. (Updated)');
      expect(result.symbol).toBe('AAPL'); // 更新されていないフィールド
      expect(result.updatedAt).toBeGreaterThan(result.createdAt);
    });
  });

  describe('delete', () => {
    it('ティッカーを削除できる', async () => {
      const input: CreateTickerInput = {
        tickerId: 'NSDQ:AAPL',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchangeId: 'NASDAQ',
      };

      await repository.create(input);
      await repository.delete('NSDQ:AAPL');

      const result = await repository.getById('NSDQ:AAPL');
      expect(result).toBeNull();
    });
  });
});
