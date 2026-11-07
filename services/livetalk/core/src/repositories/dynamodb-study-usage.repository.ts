/**
 * StudyUsageRepository の DynamoDB 実装。
 *
 * Single Table 設計のメインテーブルに相乗りし、共通の回数カウンターで数える。
 * - PK = `USER#<userId>`、SK = `STUDYUSAGE#<YYYYMMDD>` (日本時間の暦日)
 * - キャラクターごとの回数は属性 `Count#<characterId>`
 * - TTL は日が終わった翌日。削除の遅れに依存せず、日付がキーに入るため日が変われば別アイテムになる
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUsageCounter } from '@nagiyu/aws';
import { toDayTtlSeconds, toJstDayKey } from '@nagiyu/common';
import { buildStudyUsageCountAttribute, buildStudyUsageSK, buildUserPK } from '../mappers/keys.js';
import { STUDY_USAGE_ITEM_TYPE } from './study-usage.repository.interface.js';
import type {
  StudyUsageRepository,
  TryConsumeStudyUsageInput,
} from './study-usage.repository.interface.js';

export class DynamoDBStudyUsageRepository implements StudyUsageRepository {
  private readonly counter: DynamoDBUsageCounter;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.counter = new DynamoDBUsageCounter(docClient, tableName);
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
