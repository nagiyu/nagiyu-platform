/**
 * Unit tests for concurrent-queue utility
 */

import { runConcurrent } from '../../../src/lib/concurrent-queue.js';

describe('runConcurrent', () => {
  describe('正常系: 全タスクを実行', () => {
    it('全タスクを実行し結果を返す', async () => {
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];

      const { results, skippedCount } = await runConcurrent(tasks, 10, () => false);

      expect(skippedCount).toBe(0);
      expect(results).toHaveLength(3);
      const values = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
        .map((r) => r.value)
        .sort();
      expect(values).toEqual([1, 2, 3]);
    });

    it('タスクが空の場合は空の結果を返す', async () => {
      const { results, skippedCount } = await runConcurrent([], 10, () => false);

      expect(results).toHaveLength(0);
      expect(skippedCount).toBe(0);
    });
  });

  describe('正常系: 並列度制限', () => {
    it('指定した並列度を超えて同時実行しない', async () => {
      const concurrency = 3;
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return i;
      });

      await runConcurrent(tasks, concurrency, () => false);

      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
    });

    it('並列度 1 のとき逐次実行になる', async () => {
      const order: number[] = [];

      const tasks = [
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push(0);
          return 0;
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push(1);
          return 1;
        },
      ];

      await runConcurrent(tasks, 1, () => false);

      // 逐次実行なので task[0] が先に完了する
      expect(order).toEqual([0, 1]);
    });
  });

  describe('正常系: 時間予算ガード', () => {
    it('isBudgetExceeded が true のとき残タスクをスキップする', async () => {
      let callCount = 0;
      let budgetExceeded = false;

      const tasks = Array.from({ length: 5 }, () => async () => {
        callCount++;
        return callCount;
      });

      // 2 件実行後に予算超過とする
      let executedCount = 0;
      const isBudgetExceeded = () => {
        if (executedCount >= 2) {
          budgetExceeded = true;
        }
        executedCount++;
        return budgetExceeded;
      };

      const { results, skippedCount } = await runConcurrent(tasks, 1, isBudgetExceeded);

      expect(results.length + skippedCount).toBe(5);
      expect(skippedCount).toBeGreaterThan(0);
    });

    it('最初から予算超過の場合は全タスクをスキップする', async () => {
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)];

      const { results, skippedCount } = await runConcurrent(tasks, 10, () => true);

      expect(results).toHaveLength(0);
      expect(skippedCount).toBe(2);
    });
  });

  describe('異常系: タスクが失敗しても他のタスクは継続', () => {
    it('rejected になったタスクの結果も results に含まれる', async () => {
      const error = new Error('タスク失敗');
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.reject(error),
        () => Promise.resolve(3),
      ];

      const { results, skippedCount } = await runConcurrent(tasks, 10, () => false);

      expect(skippedCount).toBe(0);
      expect(results).toHaveLength(3);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBe(error);
    });
  });

  describe('正常系: jitter オプション', () => {
    it('jitterMs: 0 のとき全タスクが実行されて結果が返る', async () => {
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];

      const { results, skippedCount } = await runConcurrent(tasks, 10, () => false, {
        jitterMs: 0,
      });

      expect(skippedCount).toBe(0);
      expect(results).toHaveLength(3);
      const values = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
        .map((r) => r.value)
        .sort();
      expect(values).toEqual([1, 2, 3]);
    });

    it('jitterMs > 0 のとき全タスクが実行され、並列度上限が守られる', async () => {
      const concurrency = 2;
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return i;
      });

      const { results, skippedCount } = await runConcurrent(tasks, concurrency, () => false, {
        jitterMs: 50,
      });

      expect(skippedCount).toBe(0);
      expect(results).toHaveLength(5);
      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
    });

    it('jitterMs > 0 でも rejected タスクの結果が results に含まれる', async () => {
      const error = new Error('jitter 中のタスク失敗');
      const tasks = [() => Promise.resolve(1), () => Promise.reject(error)];

      const { results } = await runConcurrent(tasks, 5, () => false, { jitterMs: 30 });

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.status === 'rejected')).toBe(true);
    });
  });
});
