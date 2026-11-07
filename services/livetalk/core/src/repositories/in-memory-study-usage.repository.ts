/**
 * StudyUsageRepository の InMemory 実装。
 *
 * テスト・ローカル開発用。DynamoDB 実装と同じ PK / SK・属性名で共有ストアに保存する。
 * アカウント削除が `USER#<userId>` 配下をまとめて扱うため、独立した Map に持たず共有ストアに置く。
 */

import { InMemoryUsageCounter, type InMemorySingleTableStore } from '@nagiyu/aws';
import { toDayTtlSeconds, toJstDayKey } from '@nagiyu/common';
import { buildStudyUsageCountAttribute, buildStudyUsageSK, buildUserPK } from '../mappers/keys.js';
import { STUDY_USAGE_ITEM_TYPE } from './study-usage.repository.interface.js';
import type {
  StudyUsageRepository,
  TryConsumeStudyUsageInput,
} from './study-usage.repository.interface.js';

export class InMemoryStudyUsageRepository implements StudyUsageRepository {
  private readonly counter: InMemoryUsageCounter;

  constructor(store: InMemorySingleTableStore) {
    this.counter = new InMemoryUsageCounter(store);
  }

  public async tryConsume(input: TryConsumeStudyUsageInput): Promise<boolean> {
    return this.counter.tryIncrement({
      key: {
        PK: buildUserPK(input.userId),
        SK: buildStudyUsageSK(toJstDayKey(input.nowMs)),
      },
      attribute: buildStudyUsageCountAttribute(input.characterId),
      limit: input.limit,
      ttlSec: toDayTtlSeconds(input.nowMs),
      itemType: STUDY_USAGE_ITEM_TYPE,
    });
  }
}
