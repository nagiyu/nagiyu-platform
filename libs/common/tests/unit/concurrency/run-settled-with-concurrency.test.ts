import { runSettledWithConcurrency } from '../../../src/concurrency/run-settled-with-concurrency.js';

describe('runSettledWithConcurrency', () => {
  it('全件の成否を入力順で返す', async () => {
    const delays = [30, 5, 15, 1];
    const tasks = delays.map(
      (ms, i) => () => new Promise<number>((r) => setTimeout(() => r(i), ms))
    );

    const { results, skippedCount } = await runSettledWithConcurrency(tasks, 2);

    expect(skippedCount).toBe(0);
    expect(results).toEqual([0, 1, 2, 3].map((value) => ({ status: 'fulfilled', value })));
  });

  it('タスクが 0 件なら空の結果を返す', async () => {
    await expect(runSettledWithConcurrency([], 3)).resolves.toEqual({
      results: [],
      skippedCount: 0,
    });
  });

  it('同時実行数が上限を超えない', async () => {
    let running = 0;
    let maxRunning = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return i;
    });

    await runSettledWithConcurrency(tasks, 3);

    expect(maxRunning).toBe(3);
  });

  it('同時実行数 1 なら逐次実行になる', async () => {
    const order: number[] = [];
    const tasks = [20, 5].map((ms, i) => async () => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(i);
      return i;
    });

    await runSettledWithConcurrency(tasks, 1);

    expect(order).toEqual([0, 1]);
  });

  it('一部が失敗しても残りを続け、失敗も入力順で結果に含める', async () => {
    const error = new Error('タスク失敗');
    const tasks = [() => Promise.resolve(1), () => Promise.reject(error), () => Promise.resolve(3)];

    const { results, skippedCount } = await runSettledWithConcurrency(tasks, 1);

    expect(skippedCount).toBe(0);
    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: error },
      { status: 'fulfilled', value: 3 },
    ]);
  });

  it('shouldSkip が true になった以降のタスクをスキップし、実行分だけを入力順で返す', async () => {
    let evaluated = 0;
    const shouldSkip = () => evaluated++ >= 2;
    const tasks = Array.from({ length: 5 }, (_, i) => async () => i);

    const { results, skippedCount } = await runSettledWithConcurrency(tasks, 1, { shouldSkip });

    expect(results).toEqual([
      { status: 'fulfilled', value: 0 },
      { status: 'fulfilled', value: 1 },
    ]);
    expect(skippedCount).toBe(3);
  });

  it('shouldSkip は一度 true になったら以降も true として扱う', async () => {
    const answers = [false, true, false, false];
    const shouldSkip = jest.fn(() => answers.shift() ?? false);
    const tasks = Array.from({ length: 4 }, (_, i) => async () => i);

    const { results, skippedCount } = await runSettledWithConcurrency(tasks, 1, { shouldSkip });

    expect(results).toHaveLength(1);
    expect(skippedCount).toBe(3);
  });

  it('最初から shouldSkip が true なら全件スキップする', async () => {
    const task = jest.fn(async () => 1);

    const { results, skippedCount } = await runSettledWithConcurrency([task, task], 5, {
      shouldSkip: () => true,
    });

    expect(results).toEqual([]);
    expect(skippedCount).toBe(2);
    expect(task).not.toHaveBeenCalled();
  });

  describe('jitterMs', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('0 〜 jitterMs 未満の遅延を各タスクの開始前に入れる', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const timeoutSpy = jest.spyOn(global, 'setTimeout');
      const tasks = [() => Promise.resolve(1), () => Promise.resolve(2)];

      const { results } = await runSettledWithConcurrency(tasks, 1, { jitterMs: 20 });

      expect(results).toHaveLength(2);
      const delays = timeoutSpy.mock.calls.map((c) => c[1]);
      expect(delays.filter((d) => d === 10)).toHaveLength(2);
    });

    it('ジッターは worker 間で直列に待ち、タスクの開始が間隔を空けて 1 つずつになる', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const startedAt: number[] = [];
      const begin = Date.now();
      const tasks = Array.from({ length: 3 }, () => async () => {
        startedAt.push(Date.now() - begin);
        await new Promise((r) => setTimeout(r, 200));
      });

      await runSettledWithConcurrency(tasks, 3, { jitterMs: 100 });

      // 各開始の前に 50ms ずつ待つので、並行に待った場合 (全員ほぼ 50ms) と区別できる
      expect(startedAt).toHaveLength(3);
      expect(startedAt[1]! - startedAt[0]!).toBeGreaterThanOrEqual(40);
      expect(startedAt[2]! - startedAt[1]!).toBeGreaterThanOrEqual(40);
    });

    it('jitterMs が 0 なら待機しない', async () => {
      const timeoutSpy = jest.spyOn(global, 'setTimeout');

      await runSettledWithConcurrency([() => Promise.resolve(1)], 1, { jitterMs: 0 });

      expect(timeoutSpy).not.toHaveBeenCalled();
    });

    it('ジッターありでも同時実行数の上限を守り、失敗も結果に含める', async () => {
      let running = 0;
      let maxRunning = 0;
      const error = new Error('失敗');
      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        if (i === 2) throw error;
        return i;
      });

      const { results } = await runSettledWithConcurrency(tasks, 2, { jitterMs: 10 });

      expect(maxRunning).toBeLessThanOrEqual(2);
      expect(results[2]).toEqual({ status: 'rejected', reason: error });
    });
  });

  it.each([0, -1, 1.5, NaN])('同時実行数が %p ならエラーにする', async (concurrency) => {
    await expect(
      runSettledWithConcurrency([() => Promise.resolve(1)], concurrency)
    ).rejects.toThrow('同時実行数は 1 以上の整数で指定してください');
  });
});
