import {
  parseJstDateString,
  toDayTtlSeconds,
  toJstDateString,
  toJstDayEndMs,
  toJstDayKey,
  toJstDayStartMs,
  toJstMonthKey,
  toMonthTtlSeconds,
} from '../../../src/format/jst-period.js';

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

  it('日の始まりと終わりは、日本時間の 0 時と 23:59:59.999 になる', () => {
    const ms = Date.UTC(2026, 10, 5, 3, 0, 0); // 日本時間 11/5 12:00

    expect(toJstDayStartMs(ms)).toBe(Date.UTC(2026, 10, 4, 15, 0, 0));
    expect(toJstDayEndMs(ms)).toBe(Date.UTC(2026, 10, 5, 14, 59, 59, 999));
  });

  it('15:00Z の前後 1 ミリ秒で日が切り替わる', () => {
    const boundary = Date.UTC(2026, 10, 4, 15, 0, 0);

    expect(toJstDayStartMs(boundary - 1)).toBe(boundary - 24 * 60 * 60 * 1000);
    expect(toJstDayEndMs(boundary - 1)).toBe(boundary - 1);
    expect(toJstDateString(boundary - 1)).toBe('2026-11-04');
    expect(toJstDayStartMs(boundary)).toBe(boundary);
    expect(toJstDayEndMs(boundary)).toBe(boundary + 24 * 60 * 60 * 1000 - 1);
    expect(toJstDateString(boundary)).toBe('2026-11-05');
  });

  it('日の始まりそのものは同じ日のまま', () => {
    const start = Date.UTC(2026, 10, 4, 15, 0, 0);

    expect(toJstDayStartMs(start)).toBe(start);
  });

  it('日本時間の日付を YYYY-MM-DD にする', () => {
    expect(toJstDateString(Date.UTC(2026, 9, 31, 15, 0, 0))).toBe('2026-11-01');
    expect(toJstDateString(Date.UTC(2026, 11, 31, 14, 59, 59, 999))).toBe('2026-12-31');
    expect(toJstDateString(Date.UTC(2026, 11, 31, 15, 0, 0))).toBe('2027-01-01');
    expect(toJstDateString(Date.UTC(2028, 1, 28, 15, 0, 0))).toBe('2028-02-29');
    expect(toJstDateString(Date.UTC(2027, 1, 28, 15, 0, 0))).toBe('2027-03-01');
  });

  it('YYYY-MM-DD をその日の始まり (日本時間 0 時) にする', () => {
    expect(parseJstDateString('2026-11-03')).toBe(Date.UTC(2026, 10, 2, 15, 0, 0));
    expect(parseJstDateString('2027-01-01')).toBe(Date.UTC(2026, 11, 31, 15, 0, 0));
  });

  it('日付の終わりは、パースした日の終わりと一致する', () => {
    const start = parseJstDateString('2026-11-03') as number;

    expect(toJstDayEndMs(start)).toBe(Date.UTC(2026, 10, 3, 14, 59, 59, 999));
  });

  it('うるう日は実在する日付として扱い、平年の 2 月 29 日は弾く', () => {
    expect(parseJstDateString('2028-02-29')).toBe(Date.UTC(2028, 1, 28, 15, 0, 0));
    expect(parseJstDateString('2026-02-29')).toBeNull();
    expect(parseJstDateString('1900-02-29')).toBeNull();
  });

  it('実在しない日付と形式違いは null', () => {
    expect(parseJstDateString('2026-02-30')).toBeNull();
    expect(parseJstDateString('2026-04-31')).toBeNull();
    expect(parseJstDateString('2026-13-01')).toBeNull();
    expect(parseJstDateString('2026-00-10')).toBeNull();
    expect(parseJstDateString('2026-01-00')).toBeNull();
    expect(parseJstDateString('2026-1-1')).toBeNull();
    expect(parseJstDateString('2026/11/03')).toBeNull();
    expect(parseJstDateString('20261103')).toBeNull();
    expect(parseJstDateString(' 2026-11-03')).toBeNull();
    expect(parseJstDateString('')).toBeNull();
  });

  it('日付の往復が一致する', () => {
    for (const date of ['2026-01-01', '2026-12-31', '2028-02-29', '2026-03-31']) {
      expect(toJstDateString(parseJstDateString(date) as number)).toBe(date);
    }
  });

  it('日の境界は実行環境のタイムゾーンに依存しない', () => {
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        const ms = Date.UTC(2026, 10, 4, 15, 0, 0);

        expect(toJstDayStartMs(ms)).toBe(ms);
        expect(toJstDayEndMs(ms - 1)).toBe(ms - 1);
        expect(toJstDateString(ms)).toBe('2026-11-05');
        expect(parseJstDateString('2026-11-05')).toBe(ms);
      }
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
