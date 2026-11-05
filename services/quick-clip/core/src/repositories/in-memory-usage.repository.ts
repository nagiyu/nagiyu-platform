import type { InMemorySingleTableStore } from '@nagiyu/aws';
import type { UsageKind } from '../types.js';
import type { UsageCounts, UsageRepository } from './usage.repository.interface.js';
import {
  COUNTER_ATTRIBUTES,
  COUNTER_ITEM_TYPE,
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

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
  }

  public async tryConsume(input: {
    subject: string;
    month: string;
    kind: UsageKind;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.increment(
      buildCounterKey(input.subject, input.month),
      COUNTER_ATTRIBUTES[input.kind],
      COUNTER_ITEM_TYPE,
      input.limit,
      input.ttlSec
    );
  }

  public async release(input: { subject: string; month: string; kind: UsageKind }): Promise<void> {
    const key = buildCounterKey(input.subject, input.month);
    const attributeName = COUNTER_ATTRIBUTES[input.kind];
    const item = this.store.get(key.PK, key.SK);
    const current = Number(item?.[attributeName] ?? 0);
    if (item && current > 0) {
      this.store.put({ ...item, [attributeName]: current - 1 });
    }
  }

  public async getCounts(subject: string, month: string): Promise<UsageCounts> {
    const key = buildCounterKey(subject, month);
    const item = this.store.get(key.PK, key.SK);
    return {
      ai: Number(item?.[COUNTER_ATTRIBUTES.ai] ?? 0),
      noAi: Number(item?.[COUNTER_ATTRIBUTES.noAi] ?? 0),
    };
  }

  public async tryConsumeIp(input: {
    day: string;
    ipHash: string;
    limit: number;
    ttlSec: number;
  }): Promise<boolean> {
    return this.increment(
      buildIpKey(input.day, input.ipHash),
      'Count',
      IP_ITEM_TYPE,
      input.limit,
      input.ttlSec
    );
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

  private increment(
    key: { PK: string; SK: string },
    attributeName: string,
    itemType: string,
    limit: number,
    ttlSec: number
  ): boolean {
    const item = this.store.get(key.PK, key.SK);
    const current = Number(item?.[attributeName] ?? 0);
    if (limit <= 0 || current >= limit) {
      return false;
    }
    this.store.put({
      ...(item ?? { ...key, ...timestamps(), Type: itemType, TTL: ttlSec }),
      [attributeName]: current + 1,
    });
    return true;
  }
}
