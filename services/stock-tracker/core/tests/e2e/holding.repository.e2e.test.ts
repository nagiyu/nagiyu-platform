/**
 * Stock Tracker Core - Holding Repository E2E Tests
 *
 * InMemory実装を使用したE2Eテスト
 * 実DynamoDBを使わずに、複数リポジトリが同じストアを共有するパターンを検証
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryHoldingRepository } from '../../src/repositories/in-memory-holding.repository.js';
import type { CreateHoldingInput } from '../../src/entities/holding.entity.js';

describe('Holding Repository E2E Tests with InMemory Store', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryHoldingRepository;

  beforeEach(() => {
    // 共通のInMemorySingleTableStoreを作成
    store = new InMemorySingleTableStore();
    repository = new InMemoryHoldingRepository(store);
  });

  describe('基本的なCRUDフロー', () => {
    it('保有株式を作成、取得、更新、削除する一連のフローが動作する', async () => {
      // 1. 作成
      const createInput: CreateHoldingInput = {
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      };

      const created = await repository.create(createInput);
      expect(created).toMatchObject(createInput);
      expect(created.CreatedAt).toBeDefined();
      expect(created.UpdatedAt).toBeDefined();

      // 2. 取得
      const retrieved = await repository.getById('user-001', 'NSDQ:AAPL');
      expect(retrieved).toEqual(created);

      // 3. 更新
      const updated = await repository.update('user-001', 'NSDQ:AAPL', {
        Quantity: 150,
        AveragePrice: 145.0,
      });
      expect(updated.Quantity).toBe(150);
      expect(updated.AveragePrice).toBe(145.0);
      expect(updated.UpdatedAt).toBeGreaterThan(created.UpdatedAt);

      // 4. 削除
      await repository.delete('user-001', 'NSDQ:AAPL');
      const afterDelete = await repository.getById('user-001', 'NSDQ:AAPL');
      expect(afterDelete).toBeNull();
    });

    it('複数の保有株式を作成し、ユーザーごとに取得できる', async () => {
      // User1の保有株式を作成
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 50,
        AveragePrice: 450.0,
        Currency: 'USD',
      });

      // User2の保有株式を作成
      await repository.create({
        UserID: 'user-002',
        TickerID: 'NSDQ:TSLA',
        ExchangeID: 'NASDAQ',
        Quantity: 30,
        AveragePrice: 700.0,
        Currency: 'USD',
      });

      // User1の保有株式を取得
      const user1Holdings = await repository.getByUserId('user-001');
      expect(user1Holdings.items).toHaveLength(2);
      expect(user1Holdings.items.map((h) => h.TickerID)).toEqual(
        expect.arrayContaining(['NSDQ:AAPL', 'NSDQ:NVDA'])
      );

      // User2の保有株式を取得
      const user2Holdings = await repository.getByUserId('user-002');
      expect(user2Holdings.items).toHaveLength(1);
      expect(user2Holdings.items[0].TickerID).toBe('NSDQ:TSLA');
    });
  });

  describe('ページネーション', () => {
    beforeEach(async () => {
      // テストデータを作成（5件）
      for (let i = 1; i <= 5; i++) {
        await repository.create({
          UserID: 'user-001',
          TickerID: `TICKER-${i.toString().padStart(3, '0')}`,
          ExchangeID: 'NASDAQ',
          Quantity: i * 10,
          AveragePrice: i * 100,
          Currency: 'USD',
        });
      }
    });

    it('limit指定で取得件数を制限できる', async () => {
      const result = await repository.getByUserId('user-001', { limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeDefined();
      expect(result.count).toBe(5); // 総件数
    });

    it('nextCursorを使用して次のページを取得できる', async () => {
      // 最初のページ（2件）
      const firstPage = await repository.getByUserId('user-001', { limit: 2 });
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).toBeDefined();

      // 次のページ（2件）
      const secondPage = await repository.getByUserId('user-001', {
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.nextCursor).toBeDefined();

      // 最後のページ（1件）
      const thirdPage = await repository.getByUserId('user-001', {
        limit: 2,
        cursor: secondPage.nextCursor,
      });
      expect(thirdPage.items).toHaveLength(1);
      expect(thirdPage.nextCursor).toBeUndefined();
    });

    it('全件取得すると5件すべてが取得できる', async () => {
      const result = await repository.getByUserId('user-001');

      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('複数リポジトリでのストア共有', () => {
    it('同じストアを共有する複数のリポジトリが独立して動作する', async () => {
      // 2つのリポジトリインスタンスを作成（同じストアを共有）
      const repo1 = new InMemoryHoldingRepository(store);
      const repo2 = new InMemoryHoldingRepository(store);

      // repo1でデータを作成
      await repo1.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      // repo2で同じデータを取得できる
      const retrieved = await repo2.getById('user-001', 'NSDQ:AAPL');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.Quantity).toBe(100);

      // repo2でデータを更新
      await repo2.update('user-001', 'NSDQ:AAPL', { Quantity: 150 });

      // repo1で更新後のデータを取得できる
      const updated = await repo1.getById('user-001', 'NSDQ:AAPL');
      expect(updated?.Quantity).toBe(150);
    });

    it('複数のリポジトリが同じストアにデータを追加し、全体で取得できる', async () => {
      const repo1 = new InMemoryHoldingRepository(store);
      const repo2 = new InMemoryHoldingRepository(store);
      const repo3 = new InMemoryHoldingRepository(store);

      // 各リポジトリからデータを作成
      await repo1.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      await repo2.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 50,
        AveragePrice: 450.0,
        Currency: 'USD',
      });

      await repo3.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:TSLA',
        ExchangeID: 'NASDAQ',
        Quantity: 30,
        AveragePrice: 700.0,
        Currency: 'USD',
      });

      // どのリポジトリからも全体のデータを取得できる
      const holdings1 = await repo1.getByUserId('user-001');
      const holdings2 = await repo2.getByUserId('user-001');
      const holdings3 = await repo3.getByUserId('user-001');

      expect(holdings1.items).toHaveLength(3);
      expect(holdings2.items).toHaveLength(3);
      expect(holdings3.items).toHaveLength(3);

      // 内容も一致
      expect(holdings1.items).toEqual(holdings2.items);
      expect(holdings2.items).toEqual(holdings3.items);
    });
  });

  describe('エラーハンドリング', () => {
    it('存在しないデータの取得はnullを返す', async () => {
      const result = await repository.getById('non-existent-user', 'non-existent-ticker');
      expect(result).toBeNull();
    });

    it('重複作成時にEntityAlreadyExistsErrorをスローする', async () => {
      const input: CreateHoldingInput = {
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      };

      await repository.create(input);

      // 同じデータを作成しようとするとEntityAlreadyExistsErrorがスローされる
      await expect(repository.create(input)).rejects.toThrow(
        expect.objectContaining({
          name: 'EntityAlreadyExistsError',
        })
      );
    });

    it('存在しないデータの更新時にEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.update('non-existent-user', 'non-existent-ticker', { Quantity: 100 })
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'EntityNotFoundError',
        })
      );
    });

    it('存在しないデータの削除時にEntityNotFoundErrorをスローする', async () => {
      await expect(
        repository.delete('non-existent-user', 'non-existent-ticker')
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'EntityNotFoundError',
        })
      );
    });
  });

  describe('複雑なシナリオ', () => {
    it('複数ユーザーの保有株式を管理し、ユーザーごとにクエリできる', async () => {
      // User1: 3銘柄
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 50,
        AveragePrice: 450.0,
        Currency: 'USD',
      });
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:TSLA',
        ExchangeID: 'NASDAQ',
        Quantity: 30,
        AveragePrice: 700.0,
        Currency: 'USD',
      });

      // User2: 2銘柄
      await repository.create({
        UserID: 'user-002',
        TickerID: 'NSDQ:GOOGL',
        ExchangeID: 'NASDAQ',
        Quantity: 20,
        AveragePrice: 2800.0,
        Currency: 'USD',
      });
      await repository.create({
        UserID: 'user-002',
        TickerID: 'NSDQ:AMZN',
        ExchangeID: 'NASDAQ',
        Quantity: 40,
        AveragePrice: 3200.0,
        Currency: 'USD',
      });

      // User3: 1銘柄
      await repository.create({
        UserID: 'user-003',
        TickerID: 'NSDQ:MSFT',
        ExchangeID: 'NASDAQ',
        Quantity: 60,
        AveragePrice: 350.0,
        Currency: 'USD',
      });

      // 各ユーザーのデータを取得
      const user1Holdings = await repository.getByUserId('user-001');
      const user2Holdings = await repository.getByUserId('user-002');
      const user3Holdings = await repository.getByUserId('user-003');

      expect(user1Holdings.items).toHaveLength(3);
      expect(user2Holdings.items).toHaveLength(2);
      expect(user3Holdings.items).toHaveLength(1);

      // 各ユーザーのデータが混ざっていないことを確認
      expect(user1Holdings.items.every((h) => h.UserID === 'user-001')).toBe(true);
      expect(user2Holdings.items.every((h) => h.UserID === 'user-002')).toBe(true);
      expect(user3Holdings.items.every((h) => h.UserID === 'user-003')).toBe(true);
    });

    it('保有株式を追加、更新、削除する複合的なフロー', async () => {
      // 初期データ作成
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 150.0,
        Currency: 'USD',
      });

      // 追加
      await repository.create({
        UserID: 'user-001',
        TickerID: 'NSDQ:NVDA',
        ExchangeID: 'NASDAQ',
        Quantity: 50,
        AveragePrice: 450.0,
        Currency: 'USD',
      });

      // 確認: 2件
      let holdings = await repository.getByUserId('user-001');
      expect(holdings.items).toHaveLength(2);

      // 1つ目を更新
      await repository.update('user-001', 'NSDQ:AAPL', { Quantity: 150 });

      // 確認: 更新が反映されている
      const updated = await repository.getById('user-001', 'NSDQ:AAPL');
      expect(updated?.Quantity).toBe(150);

      // 1つ削除
      await repository.delete('user-001', 'NSDQ:AAPL');

      // 確認: 1件になった
      holdings = await repository.getByUserId('user-001');
      expect(holdings.items).toHaveLength(1);
      expect(holdings.items[0].TickerID).toBe('NSDQ:NVDA');
    });
  });

  describe('データの独立性', () => {
    it('各テストケースでストアをリセットすることで独立性が保たれる', async () => {
      // 1つ目のテストでデータを作成
      await repository.create({
        UserID: 'user-test',
        TickerID: 'NSDQ:TEST1',
        ExchangeID: 'NASDAQ',
        Quantity: 100,
        AveragePrice: 100.0,
        Currency: 'USD',
      });

      const result1 = await repository.getByUserId('user-test');
      expect(result1.items).toHaveLength(1);
    });

    it('前のテストケースのデータが存在しない（beforeEachでリセットされている）', async () => {
      const result = await repository.getByUserId('user-test');
      expect(result.items).toHaveLength(0);
    });
  });
});
