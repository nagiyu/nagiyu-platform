import { createErrorReporter, tryIncrementInOrder, type UsageCounter } from '@nagiyu/aws';
import { computeBucket, computeWindowTtlSec } from '../lib/chat-guard-window.js';
import { buildChatRateLimitSK, buildUserPK } from '../mappers/keys.js';
import { CHAT_RATE_LIMIT_ITEM_TYPE } from './chat-guard.repository.interface.js';
import type {
  RateLimitLimits,
  RateLimitWindow,
  TryConsumeRateLimitResult,
} from './chat-guard.repository.interface.js';

export const CHAT_RATE_LIMIT_ERROR_MESSAGES = {
  ROLLBACK_FAILED: 'チャットの 1 分の回数を戻せませんでした (1 回分多く数えたまま)',
} as const;

/** 窓のアイテム内で回数を持つ属性名 */
const COUNT_ATTRIBUTE = 'Count';

/**
 * 戻しの失敗は断りや元の例外を優先して握るため、握る箇所でその場で報告する。
 * レポーターは報告の失敗を握るので、報告のために判定が止まることはない。
 */
const errorReporter = createErrorReporter({ serviceId: 'livetalk' });

/**
 * 1 分 → 1 時間の順に、窓ごとに上限付きで数える。
 *
 * 1 分を先に数える: 断る理由の大半は 1 分の窓の使い切りで、その場合は 1 時間に触れず戻しも要らない。
 * 1 時間だけが断った場合は、1 分を戻す。これにより断られた申し込みはどちらの窓も消費しない。
 * 戻しに失敗しても 1 回分多く数えたままになるだけで、止める側にずれるため、
 * 元の結果 (断り・例外) を優先して続行し、失敗はエラーイベントに報告する。
 */
export async function tryConsumeChatRateLimit(
  counter: UsageCounter,
  userId: string,
  nowMs: number,
  limits: RateLimitLimits
): Promise<TryConsumeRateLimitResult> {
  const windows: ReadonlyArray<{ window: RateLimitWindow; limit: number }> = [
    { window: '1m', limit: limits.perMinute },
    { window: '1h', limit: limits.perHour },
  ];
  const steps = windows.map(({ window, limit }) => ({
    key: {
      PK: buildUserPK(userId),
      SK: buildChatRateLimitSK(window, computeBucket(window, nowMs)),
    },
    attribute: COUNT_ATTRIBUTE,
    limit,
    ttlSec: computeWindowTtlSec(window, nowMs),
    itemType: CHAT_RATE_LIMIT_ITEM_TYPE,
  }));

  const result = await tryIncrementInOrder(counter, steps, {
    onRollbackError: (error, rolledBack) =>
      errorReporter.report(CHAT_RATE_LIMIT_ERROR_MESSAGES.ROLLBACK_FAILED, error, {
        context: { sk: rolledBack.key.SK },
        severity: 'warning',
      }),
  });
  return result.ok
    ? { allowed: true }
    : { allowed: false, window: windows[result.deniedIndex].window };
}
