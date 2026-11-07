import type { UsageCounter } from '@nagiyu/aws';
import { logger, toDayTtlSeconds, toErrorMessage, toJstDayKey } from '@nagiyu/common';
import {
  buildStudyUsageCountAttribute,
  buildStudyUsageSK,
  buildStudyUsageTotalAttribute,
  buildUserPK,
} from '../mappers/keys.js';
import { STUDY_USAGE_ITEM_TYPE } from './study-usage.repository.interface.js';
import type { TryConsumeStudyUsageInput } from './study-usage.repository.interface.js';

/**
 * キャラクター別と利用者合計の 2 つの属性を、それぞれ上限付きで数える。
 *
 * 勉強中の人数が日の途中で変わると、キャラクター別の上限だけでは合計が利用者の上限を超えるため、
 * 合計も同じアイテムで数える。
 *
 * キャラクター別を先に数える: 上限で断る理由の大半はキャラクター別の枠の使い切りで、
 * その場合は合計に触れず戻しも要らない。合計だけが断った場合は、キャラクター別を戻す。
 * 戻しに失敗しても 1 回分多く数えたままになるだけで、止める側にずれるため握りつぶして続行する。
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
  const characterAttribute = buildStudyUsageCountAttribute(input.characterId);

  const characterOk = await counter.tryIncrement({
    ...common,
    attribute: characterAttribute,
    limit: input.limit,
  });
  if (!characterOk) return false;

  let totalOk: boolean;
  try {
    totalOk = await counter.tryIncrement({
      ...common,
      attribute: buildStudyUsageTotalAttribute(),
      limit: input.totalLimit,
    });
  } catch (error) {
    await rollbackCharacter(counter, key, characterAttribute);
    throw error;
  }
  if (!totalOk) {
    await rollbackCharacter(counter, key, characterAttribute);
    return false;
  }
  return true;
}

async function rollbackCharacter(
  counter: UsageCounter,
  key: { PK: string; SK: string },
  attribute: string
): Promise<void> {
  try {
    await counter.decrement({ key, attribute });
  } catch (error) {
    logger.warn('[studyUsage] キャラクター別の回数を戻せませんでした (1 回分多く数えたまま)', {
      err: toErrorMessage(error),
    });
  }
}
