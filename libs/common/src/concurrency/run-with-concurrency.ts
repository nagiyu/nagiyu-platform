import { CONCURRENCY_ERROR_MESSAGES as ERROR_MESSAGES } from './error-messages.js';

/**
 * タスクを最大 `concurrency` 個まで同時に実行し、結果を入力順で返す。
 *
 * 1 つでも失敗したら新しいタスクは始めず、実行中のタスクがすべて終わるのを待ってから
 * 最初のエラーで reject する。reject 時点で裏にタスクが残らないため、呼び出し元が失敗時に
 * 書いた状態を、後から終わったタスクの副作用が上書きしない。
 *
 * @param tasks 実行するタスク。呼び出されるまで処理は始まらない
 * @param concurrency 同時実行数の上限 (1 以上の整数)
 * @throws 同時実行数が 1 以上の整数でない場合、またはタスクが失敗した場合
 */
export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(ERROR_MESSAGES.INVALID_CONCURRENCY);
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (!failed && nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        results[i] = await tasks[i]!();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (failed) {
    throw firstError;
  }
  return results;
}
