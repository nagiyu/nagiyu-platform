import { InMemoryUsageCounter, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { UsageKind } from '../types.js';
import type { UsageCounts, UsageRepository } from './usage.repository.interface.js';
import {
  COUNTER_ATTRIBUTES,
  COUNTER_ITEM_TYPE,
  IP_COUNT_ATTRIBUTE,
  IP_ITEM_TYPE,
  SALT_ITEM_TYPE,
  buildCounterKey,
  buildIpKey,
  buildSaltKey,
} from '../mappers/usage-keys.js';

/** 保存形式 (DynamoDBItem) が要求する作成・更新時刻。判定には使わない */
const timestamps = (): { CreatedAt: number; UpdatedAt: number } => {
  const now = Date.now();
  return { CreatedAt: now, UpdatedAt: now };
};

/**
 * InMemory Usage Repository
 *
 * 取得と保存の間に await を挟まないため、同時に呼ばれても上限を超えない。テスト環境で使用
 */
export class InMemoryUsageRepository implements UsageRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly counter: InMemoryUsageCounter;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.counter = new InMemoryUsageCounter(store);
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
    const key = buildSaltKey(day);
    const existing = this.store.get(key.PK, key.SK)?.Salt;
    if (typeof existing === 'string') {
      return existing;
    }
    this.store.put({
      ...key,
      ...timestamps(),
      Type: SALT_ITEM_TYPE,
      Salt: candidateSalt,
      TTL: ttlSec,
    });
    return candidateSalt;
  }
}
