/**
 * Stock Tracker Core - InMemory Holding Repository Unit Tests
 *
 * InMemoryHoldingRepositoryのユニットテスト
 */

import { InMemoryHoldingRepository } from '../../../src/repositories/in-memory-holding.repository.js';
import { InMemorySingleTableStore, EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';
import type { CreateHoldingInput } from '../../../src/entities/holding.entity.js';

describe('InMemoryHoldingRepository', () => {
  let repository: InMemoryHoldingRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  describe('create', () => {
    it('新しい保有株式を作成できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.CreatedAt).toBeDefined();
      expect(result.UpdatedAt).toBeDefined();
      expect(result.CreatedAt).toBe(result.UpdatedAt);
    });

    it('同じUserID/TickerIDの保有株式が既に存在する場合はEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('異なるTickerIDであれば同じUserIDで複数作成できる', async () => {
      const input1: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const input2: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 5,
        AveragePrice: 450,
        Currency: 'USD',
      };

      const result1 = await repository.create(input1);
      const result2 = await repository.create(input2);

      expect(result1.TickerID).toBe('NSDQ:AAPL');
      expect(result2.TickerID).toBe('NSDQ:NVDA');
    });
  });

  describe('getById', () => {
    it('存在する保有株式を取得できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10.5,
        AveragePrice: 150.25,
        Currency: 'USD',
      };

      const created = await repository.create(input);
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual(created);
    });

    it('存在しない保有株式を取得した場合はnullを返す', async () => {
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('ユーザーの全保有株式を取得できる', async () => {
      const input1: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const input2: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 5,
        AveragePrice: 450,
        Currency: 'USD',
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items.map((h) => h.TickerID)).toContain('NSDQ:AAPL');
      expect(result.items.map((h) => h.TickerID)).toContain('NSDQ:NVDA');
    });

    it('他のユーザーの保有株式は取得されない', async () => {
      const input1: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const input2: CreateHoldingInput = {
        UserID: 'user-456',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 5,
        AveragePrice: 450,
        Currency: 'USD',
      };

      await repository.create(input1);
      await repository.create(input2);

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].TickerID).toBe('NSDQ:AAPL');
    });

    it('保有株式が存在しない場合は空の配列を返す', async () => {
      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
    });

    it('ページネーションが動作する', async () => {
      // 5件のデータを作成
      for (let i = 0; i < 5; i++) {
        await repository.create({
          UserID: 'user-123',
          TickerID: `NSDQ:TEST${i}`,
          ExchangeID: 'NASDAQ',
          Quantity: 10,
          AveragePrice: 100,
          Currency: 'USD',
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
  });

  describe('update', () => {
    it('保有株式を更新できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      const created = await repository.create(input);
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repository.update('user-123', 'NSDQ:AAPL', {
        Quantity: 20,
        AveragePrice: 155,
      });

      expect(updated.Quantity).toBe(20);
      expect(updated.AveragePrice).toBe(155);
      expect(updated.UpdatedAt).toBeGreaterThan(created.UpdatedAt);
      expect(updated.CreatedAt).toBe(created.CreatedAt);
    });

    it('存在しない保有株式を更新しようとした場合はEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('user-123', 'NSDQ:AAPL', { Quantity: 20 })
      ).rejects.toThrow(EntityNotFoundError);
    });

    it('更新するフィールドが指定されていない場合はエラーをスローする', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      await repository.create(input);

      await expect(repository.update('user-123', 'NSDQ:AAPL', {})).rejects.toThrow(
        '更新するフィールドが指定されていません'
      );
    });

    it('一部のフィールドだけを更新できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      await repository.create(input);
      const updated = await repository.update('user-123', 'NSDQ:AAPL', {
        Quantity: 20,
      });

      expect(updated.Quantity).toBe(20);
      expect(updated.AveragePrice).toBe(150); // 変更されていない
      expect(updated.Currency).toBe('USD'); // 変更されていない
    });
  });

  describe('delete', () => {
    it('保有株式を削除できる', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      await repository.create(input);
      await repository.delete('user-123', 'NSDQ:AAPL');

      const result = await repository.getById('user-123', 'NSDQ:AAPL');
      expect(result).toBeNull();
    });

    it('存在しない保有株式を削除しようとした場合はEntityNotFoundErrorをスローする', async () => {
      await expect(repository.delete('user-123', 'NSDQ:AAPL')).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryHoldingRepository(store);

      const input: CreateHoldingInput = {
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 10,
        AveragePrice: 150,
        Currency: 'USD',
      };

      await repository.create(input);
      const result = await repository2.getById('user-123', 'NSDQ:AAPL');

      expect(result).not.toBeNull();
      expect(result?.TickerID).toBe('NSDQ:AAPL');
    });
  });
});
