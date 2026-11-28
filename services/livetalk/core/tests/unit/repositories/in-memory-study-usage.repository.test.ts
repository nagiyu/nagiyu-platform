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
  globalLimit?: number;
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
      globalLimit: 1000,
      nowMs: NOW_MS,
      ...overrides,
    });

  it('上限ちょうどまでは数え、その次から数えない', async () => {
    expect(await consume()).toEqual({ ok: true });
    expect(await consume()).toEqual({ ok: true });
    expect(await consume()).toEqual({ ok: false, deniedBy: 'character' });
  });

  it('上限 0 では 1 回も数えない', async () => {
    expect(await consume({ limit: 0 })).toEqual({ ok: false, deniedBy: 'character' });
  });

  it('キャラクターごとに別々に数える', async () => {
    await consume();
    await consume();
    expect(await consume({ characterId: 'ageha' })).toEqual({ ok: true });
  });

  it('利用者ごとに別々に数える', async () => {
    await consume();
    await consume();
    expect(await consume({ userId: 'u2' })).toEqual({ ok: true });
  });

  it('勉強中の人数が途中で減っても、利用者の合計は上限で止まる', async () => {
    // 2 人で 10 回ずつ使った後に片方が止まり、残った 1 人の枠が 20 になる日
    for (let i = 0; i < 10; i++) {
      expect(await consume({ characterId: 'hiyori', limit: 10, totalLimit: 20 })).toEqual({
        ok: true,
      });
      expect(await consume({ characterId: 'ageha', limit: 10, totalLimit: 20 })).toEqual({
        ok: true,
      });
    }
    expect(await consume({ characterId: 'hiyori', limit: 20, totalLimit: 20 })).toEqual({
      ok: false,
      deniedBy: 'user',
    });
    // 合計が断った分はキャラクター別に残さない
    expect(store.get('USER#u1', 'STUDYUSAGE#20261105')).toMatchObject({
      'Count#hiyori': 10,
      'Count#total': 20,
    });
  });

  it('合計の上限に達した後はキャラクター別の枠が残っていても数えない', async () => {
    expect(await consume({ limit: 5, totalLimit: 1 })).toEqual({ ok: true });
    expect(await consume({ characterId: 'ageha', limit: 5, totalLimit: 1 })).toEqual({
      ok: false,
      deniedBy: 'user',
    });
  });

  it('日本時間の 0 時で日が変わる', async () => {
    const beforeMidnight = Date.parse('2026-11-05T14:59:59Z');
    const afterMidnight = Date.parse('2026-11-05T15:00:00Z');
    expect(await consume({ limit: 1, nowMs: beforeMidnight })).toEqual({ ok: true });
    expect(await consume({ limit: 1, nowMs: beforeMidnight })).toEqual({
      ok: false,
      deniedBy: 'character',
    });
    expect(await consume({ limit: 1, nowMs: afterMidnight })).toEqual({ ok: true });
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

  describe('全利用者の合計', () => {
    it('利用者が違っても、全体の上限で止まる', async () => {
      expect(await consume({ userId: 'u1', globalLimit: 2 })).toEqual({ ok: true });
      expect(await consume({ userId: 'u2', globalLimit: 2 })).toEqual({ ok: true });
      expect(await consume({ userId: 'u3', globalLimit: 2 })).toEqual({
        ok: false,
        deniedBy: 'global',
      });
    });

    it('全体が断ったら、利用者とキャラクターの回数を戻す', async () => {
      await consume({ userId: 'u1', globalLimit: 1 });
      expect(await consume({ userId: 'u2', globalLimit: 1 })).toEqual({
        ok: false,
        deniedBy: 'global',
      });

      // 戻っているので、全体の枠が空けば u2 は 1 回目から数えられる
      expect(store.get('USER#u2', 'STUDYUSAGE#20261105')).toMatchObject({
        'Count#hiyori': 0,
        'Count#total': 0,
      });
    });

    it('全体は日ごとの別アイテムに数え、日が変わると戻る', async () => {
      const beforeMidnight = Date.parse('2026-11-05T14:59:59Z');
      const afterMidnight = Date.parse('2026-11-05T15:00:00Z');
      expect(await consume({ globalLimit: 1, nowMs: beforeMidnight })).toEqual({ ok: true });
      expect(await consume({ userId: 'u2', globalLimit: 1, nowMs: beforeMidnight })).toEqual({
        ok: false,
        deniedBy: 'global',
      });
      expect(await consume({ userId: 'u2', globalLimit: 1, nowMs: afterMidnight })).toEqual({
        ok: true,
      });

      const item = store.get('GLOBAL#STUDYUSAGE', 'STUDYUSAGE#20261105');
      expect(item).toMatchObject({ Type: 'StudyUsage', 'Count#total': 1 });
      expect(item?.['TTL']).toBe(Date.parse('2026-11-06T15:00:00Z') / 1000);
    });
  });

  describe('readToday', () => {
    it('記録がない日は 0 を返す', async () => {
      expect(await repo.readToday('u1', NOW_MS)).toEqual({ userTotal: 0, globalTotal: 0 });
    });

    it('数えた回数を、利用者の合計と全体の合計で返す', async () => {
      await consume();
      await consume({ characterId: 'ageha' });
      await consume({ userId: 'u2' });

      expect(await repo.readToday('u1', NOW_MS)).toEqual({ userTotal: 2, globalTotal: 3 });
      expect(await repo.readToday('u2', NOW_MS)).toEqual({ userTotal: 1, globalTotal: 3 });
    });

    it('日本時間の 0 時で日が変わり、前の日の回数は含めない', async () => {
      await consume({ nowMs: Date.parse('2026-11-05T14:59:59Z') });
      expect(await repo.readToday('u1', Date.parse('2026-11-05T15:00:00Z'))).toEqual({
        userTotal: 0,
        globalTotal: 0,
      });
    });

    it('読むだけでは数えない', async () => {
      await repo.readToday('u1', NOW_MS);
      expect(store.get('USER#u1', 'STUDYUSAGE#20261105')).toBeUndefined();
    });
  });
});
