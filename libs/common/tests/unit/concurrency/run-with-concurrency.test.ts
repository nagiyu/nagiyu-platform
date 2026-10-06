import { runWithConcurrency } from '../../../src/concurrency/run-with-concurrency.js';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe('runWithConcurrency', () => {
  it('結果を入力順で返す', async () => {
    const delays = [30, 5, 15, 1];
    const tasks = delays.map(
      (ms, i) => () => new Promise<number>((r) => setTimeout(() => r(i), ms))
    );
    await expect(runWithConcurrency(tasks, 2)).resolves.toEqual([0, 1, 2, 3]);
  });

  it('タスクが 0 件なら空配列を返す', async () => {
    await expect(runWithConcurrency([], 3)).resolves.toEqual([]);
  });

  it('同時実行数が上限を超えず、空いたらすぐ次を始める', async () => {
    let running = 0;
    let maxRunning = 0;
    const gates = Array.from({ length: 5 }, () => deferred());
    const started: number[] = [];
    const tasks = gates.map((gate, i) => async () => {
      started.push(i);
      running++;
      maxRunning = Math.max(maxRunning, running);
      await gate.promise;
      running--;
      return i;
    });

    const promise = runWithConcurrency(tasks, 2);
    await flush();
    expect(started).toEqual([0, 1]);

    gates[1]!.resolve();
    await flush();
    expect(started).toEqual([0, 1, 2]);

    gates.forEach((g) => g.resolve());
    await promise;
    expect(maxRunning).toBe(2);
  });

  it('失敗後は新しいタスクを始めない', async () => {
    const started: number[] = [];
    const tasks = [
      async () => {
        started.push(0);
        throw new Error('失敗');
      },
      async () => {
        started.push(1);
        return 1;
      },
      async () => {
        started.push(2);
        return 2;
      },
    ];
    await expect(runWithConcurrency(tasks, 1)).rejects.toThrow('失敗');
    expect(started).toEqual([0]);
  });

  it('実行中のタスクがすべて終わってから reject する', async () => {
    const slow = deferred<number>();
    let rejected = false;
    const tasks = [
      async (): Promise<number> => {
        throw new Error('即時失敗');
      },
      () => slow.promise,
    ];
    const promise = runWithConcurrency(tasks, 2).catch((e: Error) => {
      rejected = true;
      return e;
    });
    await flush();
    expect(rejected).toBe(false);

    slow.resolve(1);
    const error = await promise;
    expect(rejected).toBe(true);
    expect((error as Error).message).toBe('即時失敗');
  });

  it('最初のエラーで reject する', async () => {
    const slow = deferred<number>();
    const tasks = [
      async (): Promise<number> => {
        throw new Error('最初のエラー');
      },
      () => slow.promise,
    ];
    const assertion = expect(runWithConcurrency(tasks, 2)).rejects.toThrow('最初のエラー');
    await flush();
    slow.reject(new Error('後のエラー'));
    await assertion;
  });

  it.each([0, -1, 1.5, NaN])('不正な同時実行数 %p はエラーにする', async (value) => {
    await expect(runWithConcurrency([async () => 1], value)).rejects.toThrow(
      '同時実行数は 1 以上の整数で指定してください'
    );
  });

  it('同時実行数がタスク数より大きくても動く', async () => {
    await expect(runWithConcurrency([async () => 1, async () => 2], 10)).resolves.toEqual([1, 2]);
  });
});
