import { formatJstMonthDay } from '../../../src/lib/format-date.js';
import { jst } from '../../helpers/jst.js';

describe('formatJstMonthDay', () => {
  it('Unix ms を "M月D日" 表記に変換する', () => {
    expect(formatJstMonthDay(jst(2026, 6, 15).getTime())).toBe('7月15日');
  });

  it('1 桁の月日でもゼロ埋めしない', () => {
    expect(formatJstMonthDay(jst(2026, 0, 5).getTime())).toBe('1月5日');
  });

  it('月末日でも正しく変換する', () => {
    expect(formatJstMonthDay(jst(2026, 11, 31).getTime())).toBe('12月31日');
  });

  it('日本時間の 0〜9 時は UTC では前日だが、日本時間の日付で変換する', () => {
    expect(formatJstMonthDay(jst(2026, 0, 1, 0, 0).getTime())).toBe('1月1日');
    expect(formatJstMonthDay(jst(2026, 0, 1, 8, 59).getTime())).toBe('1月1日');
  });

  it('日本時間 23:59 は同じ日のまま、翌 0:00 で日が替わる', () => {
    expect(formatJstMonthDay(jst(2026, 11, 31, 23, 59).getTime())).toBe('12月31日');
    expect(formatJstMonthDay(jst(2027, 0, 1, 0, 0).getTime())).toBe('1月1日');
  });
});
