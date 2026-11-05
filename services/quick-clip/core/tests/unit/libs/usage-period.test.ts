import {
  toDayTtlSeconds,
  toJstDayKey,
  toJstMonthKey,
  toMonthTtlSeconds,
} from '../../../src/libs/usage-period.js';

describe('日本時間の期間', () => {
  it('UTC では前月でも、日本時間で翌月 1 日になった時刻は翌月として扱う', () => {
    // 2026-10-31T15:00:00Z = 2026-11-01T00:00:00+09:00
    const ms = Date.UTC(2026, 9, 31, 15, 0, 0);

    expect(toJstMonthKey(ms)).toBe('202611');
    expect(toJstDayKey(ms)).toBe('20261101');
  });

  it('月末の 1 ミリ秒前は前月のまま', () => {
    const ms = Date.UTC(2026, 9, 31, 15, 0, 0) - 1;

    expect(toJstMonthKey(ms)).toBe('202610');
    expect(toJstDayKey(ms)).toBe('20261031');
  });

  it('月の TTL は翌月末 (日本時間) の 7 日後になる', () => {
    const ms = Date.UTC(2026, 10, 5, 0, 0, 0);
    // 2026-12-01T00:00+09:00 = 2026-11-30T15:00Z
    const endOfNextMonth = Date.UTC(2026, 11, 31, 15, 0, 0) / 1000;

    expect(toMonthTtlSeconds(ms)).toBe(endOfNextMonth + 7 * 24 * 60 * 60);
  });

  it('年をまたぐ月の TTL を計算できる', () => {
    const ms = Date.UTC(2026, 11, 20, 0, 0, 0);
    // 翌月 = 2027-01 の末 = 2027-02-01T00:00+09:00
    const endOfNextMonth = Date.UTC(2027, 0, 31, 15, 0, 0) / 1000;

    expect(toMonthTtlSeconds(ms)).toBe(endOfNextMonth + 7 * 24 * 60 * 60);
  });

  it('日の TTL はその日の終わりの 1 日後になる', () => {
    const ms = Date.UTC(2026, 10, 5, 3, 0, 0); // 日本時間 11/5 12:00
    const endOfDay = Date.UTC(2026, 10, 5, 15, 0, 0) / 1000;

    expect(toDayTtlSeconds(ms)).toBe(endOfDay + 24 * 60 * 60);
  });
});
