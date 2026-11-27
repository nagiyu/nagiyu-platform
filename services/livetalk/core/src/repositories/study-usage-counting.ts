import { createErrorReporter, tryIncrementInOrder, type UsageCounter } from '@nagiyu/aws';
import { toDayTtlSeconds, toJstDayKey } from '@nagiyu/common';
import {
  buildGlobalStudyUsagePK,
  buildStudyUsageCountAttribute,
  buildStudyUsageSK,
  buildStudyUsageTotalAttribute,
  buildUserPK,
} from '../mappers/keys.js';
import { STUDY_USAGE_ITEM_TYPE } from './study-usage.repository.interface.js';
import type {
  StudyUsageDeniedScope,
  TryConsumeStudyUsageInput,
  TryConsumeStudyUsageResult,
} from './study-usage.repository.interface.js';

export const STUDY_USAGE_ERROR_MESSAGES = {
  ROLLBACK_FAILED: '勉強回数を戻せませんでした (1 回分多く数えたまま)',
} as const;

/** tryIncrementInOrder に渡す段の並びと対応させる。段を足すときはここも揃える */
const DENIED_SCOPES: readonly StudyUsageDeniedScope[] = ['character', 'user', 'global'];

/**
 * 戻しの失敗は断りや元の例外を優先して握るため、握る箇所でその場で報告する。
 * レポーターは報告の失敗を握るので、報告のために判定が止まることはない。
 */
const errorReporter = createErrorReporter({ serviceId: 'livetalk' });

/**
 * キャラクター別・利用者合計・全利用者合計の 3 つを、それぞれ上限付きで数える。
 *
 * 勉強中の人数が日の途中で変わると、キャラクター別の上限だけでは合計が利用者の上限を超えるため、
 * 合計も同じアイテムで数える。全利用者の合計は、登録が急に増えたときの原価を止めるため、
 * 日ごとの別のアイテムで数える。
 *
 * 範囲の狭い順 (キャラクター別 → 利用者合計 → 全体) に数える: 上限で断る理由の大半は狭い枠の使い切りで、
 * その場合は広い枠に触れず戻しも要らない。広い枠が断った場合は、通った狭い枠を戻す。
 * 戻しに失敗しても 1 回分多く数えたままになるだけで、止める側にずれるため、
 * 元の結果 (断り・例外) を優先して続行し、失敗はエラーイベントに報告する。
 */
export async function tryConsumeStudyUsage(
  counter: UsageCounter,
  input: TryConsumeStudyUsageInput
): Promise<TryConsumeStudyUsageResult> {
  const sk = buildStudyUsageSK(toJstDayKey(input.nowMs));
  const key = { PK: buildUserPK(input.userId), SK: sk };
  const globalKey = { PK: buildGlobalStudyUsagePK(), SK: sk };
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
      {
        ...common,
        key: globalKey,
        attribute: buildStudyUsageTotalAttribute(),
        limit: input.globalLimit,
      },
    ],
    {
      onRollbackError: (error, rolledBack) =>
        errorReporter.report(STUDY_USAGE_ERROR_MESSAGES.ROLLBACK_FAILED, error, {
          context: { attribute: rolledBack.attribute },
          severity: 'warning',
        }),
    }
  );
  if (result.ok) return { ok: true };
  return { ok: false, deniedBy: DENIED_SCOPES[result.deniedIndex] };
}
