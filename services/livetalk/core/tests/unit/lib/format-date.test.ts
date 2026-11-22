import {
  formatJstMonthDay,
  formatJstFullDateWithWeekday,
  formatJstFactDate,
} from '../../../src/lib/format-date.js';
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

describe('formatJstFullDateWithWeekday', () => {
  it('年月日と曜日を返す', () => {
    expect(formatJstFullDateWithWeekday(jst(2026, 10, 20, 10).getTime())).toBe(
      '2026年11月20日(金)'
    );
  });

  it.each([
    [15, '日'],
    [16, '月'],
    [17, '火'],
    [18, '水'],
    [19, '木'],
    [20, '金'],
    [21, '土'],
  ])('2026年11月%i日は%s曜日', (day, w) => {
    expect(formatJstFullDateWithWeekday(jst(2026, 10, day).getTime())).toBe(
      `2026年11月${day}日(${w})`
    );
  });

  it('日付境界は UTC 14:59 と 15:00 で変わる', () => {
    expect(formatJstFullDateWithWeekday(Date.UTC(2026, 10, 20, 14, 59))).toBe('2026年11月20日(金)');
    expect(formatJstFullDateWithWeekday(Date.UTC(2026, 10, 20, 15, 0))).toBe('2026年11月21日(土)');
  });
});

describe('formatJstFactDate', () => {
  const now = jst(2026, 10, 20, 10).getTime();

  it('同じ年は年なしの月日にする', () => {
    expect(formatJstFactDate(jst(2026, 10, 5).getTime(), now)).toBe('11月5日');
  });

  it('年が違えば年つきにする', () => {
    expect(formatJstFactDate(jst(2025, 10, 5).getTime(), now)).toBe('2025年11月5日');
  });

  it('年またぎ: 今日が 2027-01-02 で事実が 2026-12-30 なら年つき', () => {
    expect(formatJstFactDate(jst(2026, 11, 30).getTime(), jst(2027, 0, 2).getTime())).toBe(
      '2026年12月30日'
    );
  });

  it('年の判定も日本時間で行う (UTC 12/31 15:00 は日本時間で翌年 1/1)', () => {
    const fact = Date.UTC(2026, 11, 31, 15, 0);
    expect(formatJstFactDate(fact, jst(2027, 0, 2).getTime())).toBe('1月1日');
    expect(formatJstFactDate(Date.UTC(2026, 11, 31, 14, 59), jst(2027, 0, 2).getTime())).toBe(
      '2026年12月31日'
    );
  });
});
