import type { UsageCounter, UsageCounterIncrementInput } from './usage-counter.interface.js';

/**
 * 順に数える 1 段。前の段が通ったあとに入力を作りたいときは、入力を返す関数で渡す。
 */
export type UsageCounterStep =
  UsageCounterIncrementInput | (() => Promise<UsageCounterIncrementInput>);

/** 全段を通ったか。断られたときは、断った段の位置 (0 始まり) を deniedIndex に持つ */
export type TryIncrementInOrderResult = { ok: true } | { ok: false; deniedIndex: number };

export interface TryIncrementInOrderOptions {
  /** 戻しの失敗を受け取る。1 回分多く数えたままになる段の入力が渡される */
  onRollbackError?: (error: unknown, input: UsageCounterIncrementInput) => unknown;
}

/**
 * 複数の加算を順に試し、どこかで断られたら通った段を逆順に戻す。
 *
 * 全段を通ったときだけ数えたままにする。断られた段より前は戻し、後ろは試さない。
 * 加算が例外になった場合や入力を作る関数が例外になった場合も、通った段を戻して元の例外を投げ直す。
 * 戻しの失敗は元の結果 (断り・例外) を優先して握り、onRollbackError に渡す。
 * 戻せなければ 1 回分多く数えたままになるが、上限を止める側にずれるだけである。
 *
 * @returns 全段を通ったとき `{ ok: true }`、断られたとき `{ ok: false, deniedIndex }`
 */
export async function tryIncrementInOrder(
  counter: UsageCounter,
  steps: readonly UsageCounterStep[],
  options: TryIncrementInOrderOptions = {}
): Promise<TryIncrementInOrderResult> {
  const passed: UsageCounterIncrementInput[] = [];

  for (const [index, step] of steps.entries()) {
    try {
      const input = typeof step === 'function' ? await step() : step;
      if (!(await counter.tryIncrement(input))) {
        await rollback(counter, passed, options);
        return { ok: false, deniedIndex: index };
      }
      passed.push(input);
    } catch (error) {
      await rollback(counter, passed, options);
      throw error;
    }
  }
  return { ok: true };
}

async function rollback(
  counter: UsageCounter,
  passed: readonly UsageCounterIncrementInput[],
  options: TryIncrementInOrderOptions
): Promise<void> {
  for (const input of [...passed].reverse()) {
    try {
      await counter.decrement({ key: input.key, attribute: input.attribute });
    } catch (error) {
      try {
        await options.onRollbackError?.(error, input);
      } catch {
        // 報告の失敗で、元の結果と残りの戻しを妨げない
      }
    }
  }
}
