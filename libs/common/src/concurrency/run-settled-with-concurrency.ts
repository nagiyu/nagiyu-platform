import { sleep } from '../async/sleep.js';
import { CONCURRENCY_ERROR_MESSAGES as ERROR_MESSAGES } from './error-messages.js';

export interface RunSettledWithConcurrencyOptions {
  /** true を返した時点以降、まだ始めていないタスクをスキップする (時間予算超過など) */
  shouldSkip?: () => boolean;
  /** 各タスクを始める前に入れるランダム遅延の上限 (ミリ秒)。0 なら遅延なし */
  jitterMs?: number;
}

export interface RunSettledWithConcurrencyResult<T> {
  /** 実行したタスクの成否。入力順で、スキップしたタスクは含まない */
  results: PromiseSettledResult<T>[];
  /** スキップしたタスクの数 */
  skippedCount: number;
}

/**
 * タスクを最大 `concurrency` 個まで同時に実行し、全件の成否を入力順で返す。
 *
 * 1 つ失敗しても残りのタスクは続け、reject はしない。呼び出し元が一部失敗を許容して
 * 件数の集計や失敗の再送出を自分で決められるようにするため。`shouldSkip` が true を返した
 * 時点以降は、まだ始めていないタスクを実行せずに `skippedCount` へ数える。
 *
 * @param tasks 実行するタスク。呼び出されるまで処理は始まらない
 * @param concurrency 同時実行数の上限 (1 以上の整数)
 * @param options スキップ判定とジッターの指定
 * @throws 同時実行数が 1 以上の整数でない場合
 */
export async function runSettledWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
  options: RunSettledWithConcurrencyOptions = {}
): Promise<RunSettledWithConcurrencyResult<T>> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(ERROR_MESSAGES.INVALID_CONCURRENCY);
  }

  const { shouldSkip, jitterMs = 0 } = options;
  const outcomes: Array<PromiseSettledResult<T> | undefined> = new Array(tasks.length);
  let nextIndex = 0;
  let skipping = false;
  let dispatchQueue: Promise<unknown> = Promise.resolve();

  // 開始の判定とジッターは全 worker で直列に行う。並行に待つと立ち上がりで concurrency 個が
  // ほぼ同時に始まり、ジッターで接続のバーストを和らげる意味がなくなるため
  function prepareDispatch(): Promise<boolean> {
    const turn = dispatchQueue.then(async () => {
      // 一度 true になったら戻さない。予算超過後に判定が揺れて後続だけ動くのを避ける
      if (skipping || shouldSkip?.()) {
        skipping = true;
        return false;
      }
      if (jitterMs > 0) {
        const delay = Math.floor(Math.random() * jitterMs);
        if (delay > 0) await sleep(delay);
      }
      return true;
    });
    dispatchQueue = turn;
    return turn;
  }

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      if (!(await prepareDispatch())) {
        continue;
      }

      try {
        outcomes[i] = { status: 'fulfilled', value: await tasks[i]!() };
      } catch (reason) {
        outcomes[i] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const results = outcomes.filter((o): o is PromiseSettledResult<T> => o !== undefined);
  return { results, skippedCount: tasks.length - results.length };
}
