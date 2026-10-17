import { formatDateTimeJst } from '@/lib/format-date-time';

describe('formatDateTimeJst', () => {
  it('JST の「年/月/日 時:分」に整形する', () => {
    expect(formatDateTimeJst(Date.UTC(2026, 9, 17, 2, 49))).toBe('2026/10/17 11:49');
  });

  it('UTC の日付をまたぐ時刻を JST の日付で表す', () => {
    // UTC 2026-12-31 16:05 は JST では翌年の 01:05
    expect(formatDateTimeJst(Date.UTC(2026, 11, 31, 16, 5))).toBe('2027/01/01 01:05');
  });

  it('月・日・時・分を 2 桁でゼロ埋めする', () => {
    expect(formatDateTimeJst(Date.UTC(2026, 0, 2, 0, 3))).toBe('2026/01/02 09:03');
  });

  it('0 時を 24 時ではなく 00 時で表す', () => {
    expect(formatDateTimeJst(Date.UTC(2026, 0, 1, 15, 0))).toBe('2026/01/02 00:00');
  });
});
