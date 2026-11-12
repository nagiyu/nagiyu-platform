import { createErrorReporter, tryIncrementInOrder, type UsageCounter } from '@nagiyu/aws';
import { toDayTtlSeconds, toJstDayKey } from '@nagiyu/common';
import {
  buildStudyUsageCountAttribute,
  buildStudyUsageSK,
  buildStudyUsageTotalAttribute,
  buildUserPK,
} from '../mappers/keys.js';
import { STUDY_USAGE_ITEM_TYPE } from './study-usage.repository.interface.js';
import type { TryConsumeStudyUsageInput } from './study-usage.repository.interface.js';

export const STUDY_USAGE_ERROR_MESSAGES = {
  ROLLBACK_FAILED: '勉強回数のキャラクター別の回数を戻せませんでした (1 回分多く数えたまま)',
} as const;

/**
 * 戻しの失敗は断りや元の例外を優先して握るため、握る箇所でその場で報告する。
 * レポーターは報告の失敗を握るので、報告のために判定が止まることはない。
 */
const errorReporter = createErrorReporter({ serviceId: 'livetalk' });

/**
 * キャラクター別と利用者合計の 2 つの属性を、それぞれ上限付きで数える。
 *
 * 勉強中の人数が日の途中で変わると、キャラクター別の上限だけでは合計が利用者の上限を超えるため、
 * 合計も同じアイテムで数える。
 *
 * キャラクター別を先に数える: 上限で断る理由の大半はキャラクター別の枠の使い切りで、
 * その場合は合計に触れず戻しも要らない。合計だけが断った場合は、キャラクター別を戻す。
 * 戻しに失敗しても 1 回分多く数えたままになるだけで、止める側にずれるため、
 * 元の結果 (断り・例外) を優先して続行し、失敗はエラーイベントに報告する。
 */
export async function tryConsumeStudyUsage(
  counter: UsageCounter,
  input: TryConsumeStudyUsageInput
): Promise<boolean> {
  const key = {
    PK: buildUserPK(input.userId),
    SK: buildStudyUsageSK(toJstDayKey(input.nowMs)),
  };
  const common = { key, ttlSec: toDayTtlSeconds(input.nowMs), itemType: STUDY_USAGE_ITEM_TYPE };

  const result = await tryIncrementInOrder(
    counter,
    [
      {
        ...common,
        attribute: buildStudyUsageCountAttribute(input.characterId),
        limit: input.limit,
      },
      { ...common, attribute: buildStudyUsageTotalAttribute(), limit: input.totalLimit },
    ],
    {
      onRollbackError: (error, rolledBack) =>
        errorReporter.report(STUDY_USAGE_ERROR_MESSAGES.ROLLBACK_FAILED, error, {
          context: { attribute: rolledBack.attribute },
        }),
    }
  );
  return result.ok;
}
