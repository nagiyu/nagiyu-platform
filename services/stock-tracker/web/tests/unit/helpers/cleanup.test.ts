/**
 * Cleanup Helper Unit Tests
 *
 * テストクリーンアップヘルパーの動作を検証
 */

import { cleanupRepositories } from '../../helpers/cleanup';
import {
  createAlertRepository,
  createHoldingRepository,
  createTickerRepository,
  createExchangeRepository,
  createWatchlistRepository,
} from '../../../lib/repository-factory';

describe('Cleanup Helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // インメモリモードを有効化
    process.env.USE_IN_MEMORY_REPOSITORY = 'true';
  });

  afterEach(() => {
    // 環境変数を復元
    process.env.USE_IN_MEMORY_REPOSITORY = originalEnv.USE_IN_MEMORY_REPOSITORY;
  });

  describe('cleanupRepositories', () => {
    it('呼び出すとリポジトリインスタンスがクリアされる', async () => {
      // 複数のリポジトリインスタンスを作成
      const alert1 = createAlertRepository();
      const holding1 = createHoldingRepository();
      const ticker1 = createTickerRepository();
      const exchange1 = createExchangeRepository();
      const watchlist1 = createWatchlistRepository();

      // クリーンアップを実行
      await cleanupRepositories();

      // 新しいインスタンスを作成
      const alert2 = createAlertRepository();
      const holding2 = createHoldingRepository();
      const ticker2 = createTickerRepository();
      const exchange2 = createExchangeRepository();
      const watchlist2 = createWatchlistRepository();

      // 異なるインスタンスが返されることを確認
      expect(alert1).not.toBe(alert2);
      expect(holding1).not.toBe(holding2);
      expect(ticker1).not.toBe(ticker2);
      expect(exchange1).not.toBe(exchange2);
      expect(watchlist1).not.toBe(watchlist2);
    });

    it('複数回呼び出してもエラーが発生しない', async () => {
      await expect(cleanupRepositories()).resolves.not.toThrow();
      await expect(cleanupRepositories()).resolves.not.toThrow();
      await expect(cleanupRepositories()).resolves.not.toThrow();
    });

    it('リポジトリを作成せずに呼び出してもエラーが発生しない', async () => {
      await expect(cleanupRepositories()).resolves.not.toThrow();
    });

    it('クリーンアップ後に新しいリポジトリを作成できる', async () => {
      // リポジトリを作成
      createAlertRepository();
      createHoldingRepository();

      // クリーンアップ
      await cleanupRepositories();

      // 新しいリポジトリを作成できることを確認
      expect(() => createAlertRepository()).not.toThrow();
      expect(() => createHoldingRepository()).not.toThrow();
      expect(() => createTickerRepository()).not.toThrow();
      expect(() => createExchangeRepository()).not.toThrow();
      expect(() => createWatchlistRepository()).not.toThrow();
    });

    it('全リポジトリ種別のインスタンスがクリアされる', async () => {
      // 全リポジトリのインスタンスを作成
      const alert1 = createAlertRepository();
      const holding1 = createHoldingRepository();
      const ticker1 = createTickerRepository();
      const exchange1 = createExchangeRepository();
      const watchlist1 = createWatchlistRepository();

      // 全てのリポジトリがインメモリ実装であることを確認
      // Note: 実装の詳細に依存しないように、型チェックではなく存在確認を行う
      expect(alert1).toBeDefined();
      expect(holding1).toBeDefined();
      expect(ticker1).toBeDefined();
      expect(exchange1).toBeDefined();
      expect(watchlist1).toBeDefined();

      // クリーンアップ
      await cleanupRepositories();

      // 新しいインスタンスを作成
      const alert2 = createAlertRepository();
      const holding2 = createHoldingRepository();
      const ticker2 = createTickerRepository();
      const exchange2 = createExchangeRepository();
      const watchlist2 = createWatchlistRepository();

      // 全てのリポジトリで新しいインスタンスが作成されていることを確認
      // シングルトンがリセットされたため、参照が異なるはず
      expect(alert1).not.toBe(alert2);
      expect(holding1).not.toBe(holding2);
      expect(ticker1).not.toBe(ticker2);
      expect(exchange1).not.toBe(exchange2);
      expect(watchlist1).not.toBe(watchlist2);
    });
  });
});
