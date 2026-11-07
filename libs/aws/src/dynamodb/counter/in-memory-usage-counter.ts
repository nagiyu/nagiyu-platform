import type { InMemorySingleTableStore } from '../in-memory/single-table-store.js';
import type {
  UsageCounter,
  UsageCounterIncrementInput,
  UsageCounterKey,
} from './usage-counter.interface.js';

/**
 * インメモリの回数カウンター。テスト環境で使う。
 *
 * 取得と保存の間に await を挟まないため、同時に呼ばれても上限を超えない。
 */
export class InMemoryUsageCounter implements UsageCounter {
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
  }

  public async tryIncrement(input: UsageCounterIncrementInput): Promise<boolean> {
    const { key, attribute, limit, ttlSec, itemType } = input;
    const item = this.store.get(key.PK, key.SK);
    const current = Number(item?.[attribute] ?? 0);
    if (limit <= 0 || current >= limit) {
      return false;
    }
    // 保存形式 (DynamoDBItem) が要求する作成・更新時刻。判定には使わない
    const now = Date.now();
    this.store.put({
      ...(item ?? { ...key, CreatedAt: now, UpdatedAt: now, Type: itemType, TTL: ttlSec }),
      [attribute]: current + 1,
    });
    return true;
  }

  public async decrement(input: { key: UsageCounterKey; attribute: string }): Promise<void> {
    const { key, attribute } = input;
    const item = this.store.get(key.PK, key.SK);
    const current = Number(item?.[attribute] ?? 0);
    if (item && current > 0) {
      this.store.put({ ...item, [attribute]: current - 1 });
    }
  }

  public async read(
    key: UsageCounterKey,
    attributes: readonly string[]
  ): Promise<Record<string, number>> {
    const item = this.store.get(key.PK, key.SK);
    return Object.fromEntries(
      attributes.map((attribute) => [attribute, Number(item?.[attribute] ?? 0)])
    );
  }
}
