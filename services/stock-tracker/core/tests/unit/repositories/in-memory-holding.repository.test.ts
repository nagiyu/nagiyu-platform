/**
 * Stock Tracker Core - InMemory Holding Repository Unit Tests
 *
 * InMemoryHoldingRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは Repository 経由で正しく動くことと、GSI の近似クエリだけを検証する。
 */

import { InMemoryHoldingRepository } from '../../../src/repositories/in-memory-holding.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import type { CreateHoldingInput } from '../../../src/entities/holding.entity.js';

function buildInput(overrides: Partial<CreateHoldingInput> = {}): CreateHoldingInput {
  return {
    userId: 'user-123',
    tickerId: 'NSDQ:AAPL',
    exchangeId: 'NASDAQ',
    quantity: 10,
    averagePrice: 150,
    currency: 'USD',
    ...overrides,
  };
}

describe('InMemoryHoldingRepository', () => {
  let repository: InMemoryHoldingRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  describe('create', () => {
    it('新しい保有株式を作成できる', async () => {
      const input = buildInput({ quantity: 10.5, averagePrice: 150.25 });

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      // updatedAt は EntityStore が書き込み時に採番するため、createdAt と同一ミリ秒とは限らない
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);
    });

    it('異なる tickerId であれば同じ userId で複数作成できる', async () => {
      const result1 = await repository.create(buildInput({ tickerId: 'NSDQ:AAPL' }));
      const result2 = await repository.create(buildInput({ tickerId: 'NSDQ:NVDA' }));

      expect(result1.tickerId).toBe('NSDQ:AAPL');
      expect(result2.tickerId).toBe('NSDQ:NVDA');
    });
  });

  describe('getById', () => {
    it('存在する保有株式を取得できる', async () => {
      const created = await repository.create(buildInput());

      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toEqual(created);
    });

    it('存在しない保有株式を取得した場合は null を返す', async () => {
      const result = await repository.getById('user-123', 'NSDQ:AAPL');

      expect(result).toBeNull();
    });
  });

  describe('getByUserId', () => {
    it('ユーザーの全保有株式を取得できる', async () => {
      await repository.create(buildInput({ tickerId: 'NSDQ:AAPL' }));
      await repository.create(buildInput({ tickerId: 'NSDQ:NVDA' }));

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items.map((h) => h.tickerId)).toContain('NSDQ:AAPL');
      expect(result.items.map((h) => h.tickerId)).toContain('NSDQ:NVDA');
    });

    it('他のユーザーの保有株式は取得されない', async () => {
      await repository.create(buildInput({ userId: 'user-123', tickerId: 'NSDQ:AAPL' }));
      await repository.create(buildInput({ userId: 'user-456', tickerId: 'NSDQ:NVDA' }));

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tickerId).toBe('NSDQ:AAPL');
    });

    it('保有株式が存在しない場合は空の配列を返す', async () => {
      const result = await repository.getByUserId('user-123');

      expect(result.items).toEqual([]);
    });

    it('ページネーションが動作する', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create(buildInput({ tickerId: `NSDQ:TEST${i}` }));
      }

      const page1 = await repository.getByUserId('user-123', { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeDefined();

      const page3 = await repository.getByUserId('user-123', {
        limit: 2,
        cursor: page2.nextCursor,
      });
      expect(page3.items).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('limit 未指定時は DynamoDB 実装と同じ 50 件で打ち切る', async () => {
      for (let i = 0; i < 60; i++) {
        await repository.create(buildInput({ tickerId: `NSDQ:T${String(i).padStart(3, '0')}` }));
      }

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it('limit が 0 のときも既定の 50 件にフォールバックする', async () => {
      for (let i = 0; i < 60; i++) {
        await repository.create(buildInput({ tickerId: `NSDQ:T${String(i).padStart(3, '0')}` }));
      }

      const result = await repository.getByUserId('user-123', { limit: 0 });

      expect(result.items).toHaveLength(50);
    });
  });

  describe('update', () => {
    it('保有株式を更新できる', async () => {
      const created = await repository.create(buildInput());
      // 確実にタイムスタンプが異なるように待機
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.update('user-123', 'NSDQ:AAPL', {
        quantity: 20,
        averagePrice: 155,
      });

      expect(updated.quantity).toBe(20);
      expect(updated.averagePrice).toBe(155);
      expect(updated.currency).toBe('USD'); // 更新されていないフィールド
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(updated.createdAt).toBe(created.createdAt);
    });
  });

  describe('delete', () => {
    it('保有株式を削除できる', async () => {
      await repository.create(buildInput());

      await repository.delete('user-123', 'NSDQ:AAPL');

      expect(await repository.getById('user-123', 'NSDQ:AAPL')).toBeNull();
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを使う複数のリポジトリでデータを共有できる', async () => {
      const repository2 = new InMemoryHoldingRepository(store);

      await repository.create(buildInput());
      const result = await repository2.getById('user-123', 'NSDQ:AAPL');

      expect(result).not.toBeNull();
      expect(result?.tickerId).toBe('NSDQ:AAPL');
    });
  });
});
