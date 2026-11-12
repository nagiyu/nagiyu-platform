import type { EntityStore, UsageCounter } from '@nagiyu/aws';
import type { DailySalt, DailySaltKey, UsageKind } from '../types.js';
import type { UsageCounts, UsageRepository } from './usage.repository.interface.js';
import {
  COUNTER_ATTRIBUTES,
  COUNTER_ITEM_TYPE,
  IP_COUNT_ATTRIBUTE,
  IP_ITEM_TYPE,
  buildCounterKey,
  buildIpKey,
} from '../mappers/usage-keys.js';

/**
 * 数え方とキーの組み立てを持つ UsageRepository。
 *
 * DynamoDB 版と InMemory 版で数え方がずれないよう、ここに 1 つだけ置く。
 * 版ごとの違いは、注入するカウンターと塩のストアだけにする。
 */
export class CountingUsageRepository implements UsageRepository {
  private readonly counter: UsageCounter;
  private readonly saltStore: EntityStore<DailySalt, DailySaltKey>;

  constructor(counter: UsageCounter, saltStore: EntityStore<DailySalt, DailySaltKey>) {
    this.counter = counter;
    this.saltStore = saltStore;
  }

  public async tryConsume(input: {
    subject: string;
    month: string;
    kind: UsageKind;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.counter.tryIncrement({
      key: buildCounterKey(input.subject, input.month),
      attribute: COUNTER_ATTRIBUTES[input.kind],
      itemType: COUNTER_ITEM_TYPE,
      limit: input.limit,
      ttlSec: input.ttlSec,
    });
  }

  public async release(input: { subject: string; month: string; kind: UsageKind }): Promise<void> {
    await this.counter.decrement({
      key: buildCounterKey(input.subject, input.month),
      attribute: COUNTER_ATTRIBUTES[input.kind],
    });
  }

  public async getCounts(subject: string, month: string): Promise<UsageCounts> {
    const counts = await this.counter.read(buildCounterKey(subject, month), [
      COUNTER_ATTRIBUTES.ai,
      COUNTER_ATTRIBUTES.noAi,
    ]);
    return { ai: counts[COUNTER_ATTRIBUTES.ai], noAi: counts[COUNTER_ATTRIBUTES.noAi] };
  }

  public async tryConsumeIp(input: {
    day: string;
    ipHash: string;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.counter.tryIncrement({
      key: buildIpKey(input.day, input.ipHash),
      attribute: IP_COUNT_ATTRIBUTE,
      itemType: IP_ITEM_TYPE,
      limit: input.limit,
      ttlSec: input.ttlSec,
    });
  }

  public async getOrCreateDailySalt(
    day: string,
    candidateSalt: string,
    ttlSec: number
  ): Promise<string> {
    // 塩はその日の最初の 1 回しか作られないため、先に読んで条件付き書き込みの失敗を避ける
    const existing = await this.saltStore.get({ day }, { consistentRead: true });
    if (existing !== null) {
      return existing.salt;
    }
    // 同時に別のリクエストが先に作っていたら、その塩が返る
    const { entity } = await this.saltStore.createIfAbsent({ day, salt: candidateSalt, ttlSec });
    return entity.salt;
  }
}
