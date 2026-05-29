/**
 * 並列度上限付きタスク実行ユーティリティ
 *
 * Promise.race を使ったセマフォ方式で concurrency を超える同時実行を防ぐ。
 * isBudgetExceeded が true を返した時点以降のタスクはスキップする。
 * jitterMs を指定するとタスク dispatch 前にランダム遅延を挿入し、
 * 接続バーストを緩和する。
 */

export interface ConcurrentRunResult<T> {
  results: PromiseSettledResult<T>[];
  skippedCount: number;
}

export interface ConcurrentRunOptions {
  /** タスク dispatch 前に挿入するランダム遅延の上限（ミリ秒）。0 の場合は遅延なし */
  jitterMs?: number;
}

export async function runConcurrent<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
  isBudgetExceeded: () => boolean,
  options: ConcurrentRunOptions = {}
): Promise<ConcurrentRunResult<T>> {
  const { jitterMs = 0 } = options;
  const results: PromiseSettledResult<T>[] = [];
  let skippedCount = 0;
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    if (isBudgetExceeded()) {
      skippedCount++;
      continue;
    }

    if (jitterMs > 0) {
      const delay = Math.floor(Math.random() * jitterMs);
      if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    const p: Promise<void> = task()
      .then(
        (value) => {
          results.push({ status: 'fulfilled', value });
        },
        (reason: unknown) => {
          results.push({ status: 'rejected', reason });
        }
      )
      .finally(() => {
        executing.delete(p);
      });

    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  return { results, skippedCount };
}
