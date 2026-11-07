/**
 * InMemoryStudyUsageRepository のユニットテスト。
 *
 * テスト観点:
 * - 上限までは数え、上限に達したら数えない
 * - キャラクター・利用者・日ごとに別々に数える
 * - 日本時間の 0 時で日が変わる
 * - DynamoDB 実装と同じキー・属性名で共有ストアに保存する
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import { InMemoryStudyUsageRepository } from '../../../src/repositories/in-memory-study-usage.repository.js';

// 2026-11-05 12:00 JST
const NOW_MS = Date.parse('2026-11-05T03:00:00Z');

interface ConsumeOverrides {
  userId?: string;
  characterId?: string;
  limit?: number;
  totalLimit?: number;
  nowMs?: number;
}

describe('InMemoryStudyUsageRepository', () => {
  let store: InMemorySingleTableStore;
  let repo: InMemoryStudyUsageRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repo = new InMemoryStudyUsageRepository(store);
  });

  const consume = (overrides: ConsumeOverrides = {}) =>
    repo.tryConsume({
      userId: 'u1',
      characterId: 'hiyori',
      limit: 2,
      totalLimit: 100,
      nowMs: NOW_MS,
      ...overrides,
    });

  it('上限ちょうどまでは数え、その次から数えない', async () => {
    expect(await consume()).toBe(true);
    expect(await consume()).toBe(true);
    expect(await consume()).toBe(false);
  });

  it('上限 0 では 1 回も数えない', async () => {
    expect(await consume({ limit: 0 })).toBe(false);
  });

  it('キャラクターごとに別々に数える', async () => {
    await consume();
    await consume();
    expect(await consume({ characterId: 'ageha' })).toBe(true);
  });

  it('利用者ごとに別々に数える', async () => {
    await consume();
    await consume();
    expect(await consume({ userId: 'u2' })).toBe(true);
  });

  it('勉強中の人数が途中で減っても、利用者の合計は上限で止まる', async () => {
    // 2 人で 10 回ずつ使った後に片方が止まり、残った 1 人の枠が 20 になる日
    for (let i = 0; i < 10; i++) {
      expect(await consume({ characterId: 'hiyori', limit: 10, totalLimit: 20 })).toBe(true);
      expect(await consume({ characterId: 'ageha', limit: 10, totalLimit: 20 })).toBe(true);
    }
    expect(await consume({ characterId: 'hiyori', limit: 20, totalLimit: 20 })).toBe(false);
    // 合計が断った分はキャラクター別に残さない
    expect(store.get('USER#u1', 'STUDYUSAGE#20261105')).toMatchObject({
      'Count#hiyori': 10,
      'Count#total': 20,
    });
  });

  it('合計の上限に達した後はキャラクター別の枠が残っていても数えない', async () => {
    expect(await consume({ limit: 5, totalLimit: 1 })).toBe(true);
    expect(await consume({ characterId: 'ageha', limit: 5, totalLimit: 1 })).toBe(false);
  });

  it('日本時間の 0 時で日が変わる', async () => {
    const beforeMidnight = Date.parse('2026-11-05T14:59:59Z');
    const afterMidnight = Date.parse('2026-11-05T15:00:00Z');
    expect(await consume({ limit: 1, nowMs: beforeMidnight })).toBe(true);
    expect(await consume({ limit: 1, nowMs: beforeMidnight })).toBe(false);
    expect(await consume({ limit: 1, nowMs: afterMidnight })).toBe(true);
  });

  it('利用者 × 日のアイテムに、キャラクターごとの属性で保存する', async () => {
    await consume();
    await consume({ characterId: 'ageha' });

    const item = store.get('USER#u1', 'STUDYUSAGE#20261105');
    expect(item).toMatchObject({
      Type: 'StudyUsage',
      'Count#hiyori': 1,
      'Count#ageha': 1,
      'Count#total': 2,
    });
    // 日が終わった翌日 (2026-11-07 00:00 JST) の TTL
    expect(item?.['TTL']).toBe(Date.parse('2026-11-06T15:00:00Z') / 1000);
  });
});
