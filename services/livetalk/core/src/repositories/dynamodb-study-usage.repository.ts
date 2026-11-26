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
import { readStudyUsageToday, tryConsumeStudyUsage } from './study-usage-counting.js';
import type {
  StudyUsageRepository,
  StudyUsageToday,
  TryConsumeStudyUsageInput,
  TryConsumeStudyUsageResult,
} from './study-usage.repository.interface.js';

export class DynamoDBStudyUsageRepository implements StudyUsageRepository {
  private readonly counter: DynamoDBUsageCounter;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.counter = new DynamoDBUsageCounter(docClient, tableName);
  }

  public async tryConsume(input: TryConsumeStudyUsageInput): Promise<TryConsumeStudyUsageResult> {
    return tryConsumeStudyUsage(this.counter, input);
  }

  public async readToday(userId: string, nowMs: number): Promise<StudyUsageToday> {
    return readStudyUsageToday(this.counter, userId, nowMs);
  }
}
