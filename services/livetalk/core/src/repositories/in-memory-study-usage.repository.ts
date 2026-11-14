/**
 * StudyUsageRepository の InMemory 実装。
 *
 * テスト・ローカル開発用。DynamoDB 実装と同じ PK / SK・属性名で共有ストアに保存する。
 * アカウント削除が `USER#<userId>` 配下をまとめて扱うため、独立した Map に持たず共有ストアに置く。
 */

import { InMemoryUsageCounter, type InMemorySingleTableStore } from '@nagiyu/aws';
import { tryConsumeStudyUsage } from './study-usage-counting.js';
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
    return tryConsumeStudyUsage(this.counter, input);
  }
}
