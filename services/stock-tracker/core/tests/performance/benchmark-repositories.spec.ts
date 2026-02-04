/**
 * Repository Performance Benchmark
 *
 * インメモリリポジトリとDynamoDBリポジトリのパフォーマンスを測定
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryAlertRepository,
  InMemoryHoldingRepository,
  InMemoryTickerRepository,
  InMemoryExchangeRepository,
  InMemoryWatchlistRepository,
  type AlertEntity,
} from '@nagiyu/stock-tracker-core';

// パフォーマンス測定結果の型定義
interface BenchmarkResult {
  operation: string;
  repository: string;
  iterations: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  medianTimeMs: number;
}

// パフォーマンス測定ユーティリティ
class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * 操作のパフォーマンスを測定
   *
   * @param name - 測定名
   * @param operation - 測定する操作
   * @param iterations - 反復回数
   * @returns 測定結果
   */
  public async measure(
    name: string,
    repository: string,
    operation: () => Promise<void>,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    const times: number[] = [];

    // ウォームアップ（初回実行のオーバーヘッドを除外）
    await operation();

    // 測定実行
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }

    // 統計計算
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const sortedTimes = [...times].sort((a, b) => a - b);
    const median =
      iterations % 2 === 0
        ? (sortedTimes[iterations / 2 - 1] + sortedTimes[iterations / 2]) / 2
        : sortedTimes[Math.floor(iterations / 2)];

    const result: BenchmarkResult = {
      operation: name,
      repository,
      iterations,
      totalTimeMs: totalTime,
      averageTimeMs: totalTime / iterations,
      minTimeMs: Math.min(...times),
      maxTimeMs: Math.max(...times),
      medianTimeMs: median,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 全測定結果を取得
   */
  public getResults(): BenchmarkResult[] {
    return this.results;
  }

  /**
   * 結果をコンソールに出力
   */
  public printResults(): void {
    console.log('\n=== リポジトリパフォーマンスベンチマーク結果 ===\n');

    for (const result of this.results) {
      console.log(`[${result.repository}] ${result.operation}`);
      console.log(`  反復回数: ${result.iterations}`);
      console.log(`  合計時間: ${result.totalTimeMs.toFixed(2)}ms`);
      console.log(`  平均時間: ${result.averageTimeMs.toFixed(2)}ms`);
      console.log(`  最小時間: ${result.minTimeMs.toFixed(2)}ms`);
      console.log(`  最大時間: ${result.maxTimeMs.toFixed(2)}ms`);
      console.log(`  中央値:   ${result.medianTimeMs.toFixed(2)}ms`);
      console.log('');
    }
  }

  /**
   * 比較レポートを生成
   */
  public generateComparisonReport(): string {
    const report: string[] = [
      '## リポジトリパフォーマンス比較レポート',
      '',
      '| 操作 | リポジトリ | 平均時間 (ms) | 中央値 (ms) | 最小 (ms) | 最大 (ms) |',
      '|------|-----------|--------------|------------|----------|----------|',
    ];

    for (const result of this.results) {
      report.push(
        `| ${result.operation} | ${result.repository} | ${result.averageTimeMs.toFixed(2)} | ${result.medianTimeMs.toFixed(2)} | ${result.minTimeMs.toFixed(2)} | ${result.maxTimeMs.toFixed(2)} |`
      );
    }

    return report.join('\n');
  }
}

describe('Repository Performance Benchmark', () => {
  let store: InMemorySingleTableStore;
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    benchmark = new PerformanceBenchmark();
  });

  afterEach(() => {
    // 測定結果を出力
    benchmark.printResults();
  });

  describe('Alert Repository', () => {
    it('should measure create performance', async () => {
      const repo = new InMemoryAlertRepository(store);
      let counter = 0;

      const result = await benchmark.measure(
        'Alert.create',
        'InMemory',
        async () => {
          await repo.create({
            userId: 'user1',
            tickerId: 'ticker1',
            price: 100 + counter++,
            frequency: 'once',
            isActive: true,
          });
        },
        100
      );

      // パフォーマンス期待値: 平均1ms以下
      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure getById performance', async () => {
      const repo = new InMemoryAlertRepository(store);

      // テストデータを作成
      const alert = await repo.create({
        userId: 'user1',
        tickerId: 'ticker1',
        price: 100,
        frequency: 'once',
        isActive: true,
      });

      const result = await benchmark.measure(
        'Alert.getById',
        'InMemory',
        async () => {
          await repo.getById(alert.userId, alert.alertId);
        },
        100
      );

      // パフォーマンス期待値: 平均0.5ms以下
      expect(result.averageTimeMs).toBeLessThan(0.5);
    });

    it('should measure getByUserId performance', async () => {
      const repo = new InMemoryAlertRepository(store);

      // テストデータを複数作成
      for (let i = 0; i < 10; i++) {
        await repo.create({
          userId: 'user1',
          tickerId: `ticker${i}`,
          price: 100 + i,
          frequency: 'once',
          isActive: true,
        });
      }

      const result = await benchmark.measure(
        'Alert.getByUserId',
        'InMemory',
        async () => {
          await repo.getByUserId('user1', { limit: 10 });
        },
        100
      );

      // パフォーマンス期待値: 平均1ms以下
      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure update performance', async () => {
      const repo = new InMemoryAlertRepository(store);

      const alert = await repo.create({
        userId: 'user1',
        tickerId: 'ticker1',
        price: 100,
        frequency: 'once',
        isActive: true,
      });

      const result = await benchmark.measure(
        'Alert.update',
        'InMemory',
        async () => {
          await repo.update(alert.userId, alert.alertId, { price: 200 });
        },
        100
      );

      // パフォーマンス期待値: 平均1ms以下
      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure delete performance', async () => {
      const repo = new InMemoryAlertRepository(store);
      const alerts: AlertEntity[] = [];

      // テストデータを事前に複数作成
      for (let i = 0; i < 100; i++) {
        const alert = await repo.create({
          userId: 'user1',
          tickerId: `ticker${i}`,
          price: 100 + i,
          frequency: 'once',
          isActive: true,
        });
        alerts.push(alert);
      }

      let index = 0;
      const result = await benchmark.measure(
        'Alert.delete',
        'InMemory',
        async () => {
          const alert = alerts[index++];
          await repo.delete(alert.userId, alert.alertId);
        },
        100
      );

      // パフォーマンス期待値: 平均0.5ms以下
      expect(result.averageTimeMs).toBeLessThan(0.5);
    });
  });

  describe('Holding Repository', () => {
    it('should measure create performance', async () => {
      const repo = new InMemoryHoldingRepository(store);
      let counter = 0;

      const result = await benchmark.measure(
        'Holding.create',
        'InMemory',
        async () => {
          await repo.create({
            userId: 'user1',
            tickerId: `ticker${counter++}`,
            quantity: 100,
            averagePrice: 100,
          });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure getById performance', async () => {
      const repo = new InMemoryHoldingRepository(store);

      await repo.create({
        userId: 'user1',
        tickerId: 'ticker1',
        quantity: 100,
        averagePrice: 100,
      });

      const result = await benchmark.measure(
        'Holding.getById',
        'InMemory',
        async () => {
          await repo.getById('user1', 'ticker1');
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(0.5);
    });

    it('should measure getByUserId performance', async () => {
      const repo = new InMemoryHoldingRepository(store);

      for (let i = 0; i < 10; i++) {
        await repo.create({
          userId: 'user1',
          tickerId: `ticker${i}`,
          quantity: 100,
          averagePrice: 100,
        });
      }

      const result = await benchmark.measure(
        'Holding.getByUserId',
        'InMemory',
        async () => {
          await repo.getByUserId('user1', { limit: 10 });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });
  });

  describe('Ticker Repository', () => {
    it('should measure create performance', async () => {
      const repo = new InMemoryTickerRepository(store);
      let counter = 0;

      const result = await benchmark.measure(
        'Ticker.create',
        'InMemory',
        async () => {
          await repo.create({
            tickerId: `ticker${counter++}`,
            exchangeId: 'exchange1',
            symbol: 'AAPL',
            name: 'Apple Inc.',
          });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure getById performance', async () => {
      const repo = new InMemoryTickerRepository(store);

      await repo.create({
        tickerId: 'ticker1',
        exchangeId: 'exchange1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
      });

      const result = await benchmark.measure(
        'Ticker.getById',
        'InMemory',
        async () => {
          await repo.getById('ticker1');
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(0.5);
    });
  });

  describe('Exchange Repository', () => {
    it('should measure create performance', async () => {
      const repo = new InMemoryExchangeRepository(store);
      let counter = 0;

      const result = await benchmark.measure(
        'Exchange.create',
        'InMemory',
        async () => {
          await repo.create({
            exchangeId: `exchange${counter++}`,
            name: 'Test Exchange',
            timezone: 'America/New_York',
          });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure getAll performance', async () => {
      const repo = new InMemoryExchangeRepository(store);

      for (let i = 0; i < 10; i++) {
        await repo.create({
          exchangeId: `exchange${i}`,
          name: `Exchange ${i}`,
          timezone: 'America/New_York',
        });
      }

      const result = await benchmark.measure(
        'Exchange.getAll',
        'InMemory',
        async () => {
          await repo.getAll();
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });
  });

  describe('Watchlist Repository', () => {
    it('should measure create performance', async () => {
      const repo = new InMemoryWatchlistRepository(store);
      let counter = 0;

      const result = await benchmark.measure(
        'Watchlist.create',
        'InMemory',
        async () => {
          await repo.create({
            userId: 'user1',
            tickerId: `ticker${counter++}`,
          });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });

    it('should measure getByUserId performance', async () => {
      const repo = new InMemoryWatchlistRepository(store);

      for (let i = 0; i < 10; i++) {
        await repo.create({
          userId: 'user1',
          tickerId: `ticker${i}`,
        });
      }

      const result = await benchmark.measure(
        'Watchlist.getByUserId',
        'InMemory',
        async () => {
          await repo.getByUserId('user1', { limit: 10 });
        },
        100
      );

      expect(result.averageTimeMs).toBeLessThan(1);
    });
  });

  describe('Memory Usage', () => {
    it('should measure memory footprint of InMemoryStore', async () => {
      const initialMemory = process.memoryUsage();

      // 大量のデータを作成
      const alertRepo = new InMemoryAlertRepository(store);
      const holdingRepo = new InMemoryHoldingRepository(store);
      const tickerRepo = new InMemoryTickerRepository(store);

      for (let i = 0; i < 1000; i++) {
        await tickerRepo.create({
          tickerId: `ticker${i}`,
          exchangeId: 'exchange1',
          symbol: `SYM${i}`,
          name: `Stock ${i}`,
        });
      }

      for (let i = 0; i < 1000; i++) {
        await alertRepo.create({
          userId: `user${i % 10}`,
          tickerId: `ticker${i}`,
          price: 100 + i,
          frequency: 'once',
          isActive: true,
        });
      }

      for (let i = 0; i < 1000; i++) {
        await holdingRepo.create({
          userId: `user${i % 10}`,
          tickerId: `ticker${i}`,
          quantity: 100,
          averagePrice: 100,
        });
      }

      const finalMemory = process.memoryUsage();

      const memoryIncreaseMB = {
        heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024,
        heapTotal: (finalMemory.heapTotal - initialMemory.heapTotal) / 1024 / 1024,
        external: (finalMemory.external - initialMemory.external) / 1024 / 1024,
      };

      console.log('\n=== メモリ使用量 ===');
      console.log(`データ数: Ticker 1000件, Alert 1000件, Holding 1000件`);
      console.log(`Heap使用量増加: ${memoryIncreaseMB.heapUsed.toFixed(2)}MB`);
      console.log(`Heap合計増加: ${memoryIncreaseMB.heapTotal.toFixed(2)}MB`);
      console.log(`外部メモリ増加: ${memoryIncreaseMB.external.toFixed(2)}MB`);
      console.log('');

      // メモリ使用量が妥当な範囲内であることを確認（3000件で50MB以下）
      expect(memoryIncreaseMB.heapUsed).toBeLessThan(50);
    });
  });

  describe('Comparison Report Generation', () => {
    it('should generate comprehensive performance report', async () => {
      // 各種操作のベンチマークを実行
      const alertRepo = new InMemoryAlertRepository(store);
      const holdingRepo = new InMemoryHoldingRepository(store);
      const tickerRepo = new InMemoryTickerRepository(store);

      // Alert操作
      await benchmark.measure(
        'Alert.create',
        'InMemory',
        async () => {
          await alertRepo.create({
            userId: 'user1',
            tickerId: 'ticker1',
            price: 100,
            frequency: 'once',
            isActive: true,
          });
        },
        50
      );

      // Holding操作
      await benchmark.measure(
        'Holding.create',
        'InMemory',
        async () => {
          await holdingRepo.create({
            userId: 'user1',
            tickerId: 'ticker2',
            quantity: 100,
            averagePrice: 100,
          });
        },
        50
      );

      // Ticker操作
      await benchmark.measure(
        'Ticker.create',
        'InMemory',
        async () => {
          await tickerRepo.create({
            tickerId: 'ticker3',
            exchangeId: 'exchange1',
            symbol: 'TEST',
            name: 'Test Stock',
          });
        },
        50
      );

      // レポート生成
      const report = benchmark.generateComparisonReport();
      console.log('\n' + report);

      expect(report).toContain('## リポジトリパフォーマンス比較レポート');
      expect(report).toContain('Alert.create');
      expect(report).toContain('Holding.create');
      expect(report).toContain('Ticker.create');
    });
  });
});
