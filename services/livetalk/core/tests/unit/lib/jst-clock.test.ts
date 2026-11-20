import { getJstHour, getJstMinutesOfDay } from '../../../src/lib/jst-clock.js';
import { jst } from '../../helpers/jst.js';

describe('getJstMinutesOfDay', () => {
  it.each([
    [0, 0, 0],
    [0, 1, 1],
    [1, 30, 90],
    [8, 59, 539],
    [9, 0, 540],
    [10, 15, 615],
    [23, 59, 1439],
  ])('日本時間 %i:%i → %i 分', (hour, minute, expected) => {
    expect(getJstMinutesOfDay(jst(2026, 0, 1, hour, minute))).toBe(expected);
  });

  it('UTC では前日になる日本時間 0〜9 時でも、日本時間の経過分を返す', () => {
    // 日本時間 2026-01-01 03:00 = UTC 2025-12-31 18:00
    const date = new Date(Date.UTC(2025, 11, 31, 18, 0, 0));
    expect(getJstMinutesOfDay(date)).toBe(180);
  });

  it('秒・ミリ秒は分に含めない', () => {
    expect(getJstMinutesOfDay(jst(2026, 0, 1, 10, 0, 59))).toBe(600);
  });
});

describe('getJstHour', () => {
  it.each([0, 1, 8, 9, 10, 12, 17, 18, 23])('日本時間 %i 時 → %i', (hour) => {
    expect(getJstHour(jst(2026, 5, 1, hour, 59))).toBe(hour);
  });

  it('UTC では前日になる日本時間 0 時台でも 0 を返す', () => {
    // 日本時間 2026-01-01 00:30 = UTC 2025-12-31 15:30
    expect(getJstHour(new Date(Date.UTC(2025, 11, 31, 15, 30, 0)))).toBe(0);
  });
});
