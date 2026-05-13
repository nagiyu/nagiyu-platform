/**
 * 並列度上限付きタスク実行ユーティリティ
 *
 * Promise.race を使ったセマフォ方式で concurrency を超える同時実行を防ぐ。
 * isBudgetExceeded が true を返した時点以降のタスクはスキップする。
 */

export interface ConcurrentRunResult<T> {
  results: PromiseSettledResult<T>[];
  skippedCount: number;
}

export async function runConcurrent<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
  isBudgetExceeded: () => boolean
): Promise<ConcurrentRunResult<T>> {
  const results: PromiseSettledResult<T>[] = [];
  let skippedCount = 0;
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    if (isBudgetExceeded()) {
      skippedCount++;
      continue;
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
