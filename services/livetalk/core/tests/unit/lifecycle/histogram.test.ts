import type { MessageEntity } from '../../../src/entities/message.entity.js';
import { buildHourlyHistogram, findPeakInRange } from '../../../src/lifecycle/histogram.js';

function makeUserMessage(createdAt: number): MessageEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MessageID: `msg-${createdAt}`,
    Role: 'user',
    Text: 'hello',
    CreatedAt: createdAt,
    UpdatedAt: createdAt,
  };
}

// JST 2026-01-01 HH:00:00 の UTC Unix ms
// JST = UTC+9 なので JST 8:00 = UTC -1 = 前日 23:00 UTC
function jstHourToUtcMs(hour: number): number {
  // 2026-01-01T00:00:00+09:00 = 2025-12-31T15:00:00Z
  const jstEpochMs = Date.UTC(2025, 11, 31, 15, 0, 0); // JST 2026-01-01 00:00
  return jstEpochMs + hour * 3600 * 1000;
}

describe('buildHourlyHistogram', () => {
  it('メッセージなし → 全バケット 0', () => {
    const result = buildHourlyHistogram([]);
    expect(result).toHaveLength(24);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('JST 8 時のメッセージが bucket[8] にカウントされる', () => {
    const msg = makeUserMessage(jstHourToUtcMs(8));
    const result = buildHourlyHistogram([msg]);
    expect(result[8]).toBe(1);
    const others = result.filter((_, i) => i !== 8);
    expect(others.every((v) => v === 0)).toBe(true);
  });

  it('JST 0 時のメッセージが bucket[0] にカウントされる', () => {
    const msg = makeUserMessage(jstHourToUtcMs(0));
    const result = buildHourlyHistogram([msg]);
    expect(result[0]).toBe(1);
  });

  it('JST 23 時のメッセージが bucket[23] にカウントされる', () => {
    const msg = makeUserMessage(jstHourToUtcMs(23));
    const result = buildHourlyHistogram([msg]);
    expect(result[23]).toBe(1);
  });

  it('複数メッセージが同じ時間帯に集まる', () => {
    const msgs = [
      makeUserMessage(jstHourToUtcMs(21)),
      makeUserMessage(jstHourToUtcMs(21) + 1800000),
      makeUserMessage(jstHourToUtcMs(21) + 3000000),
    ];
    const result = buildHourlyHistogram(msgs);
    expect(result[21]).toBe(3);
  });

  it('複数の時間帯に分散する', () => {
    const msgs = [
      makeUserMessage(jstHourToUtcMs(8)),
      makeUserMessage(jstHourToUtcMs(9)),
      makeUserMessage(jstHourToUtcMs(21)),
    ];
    const result = buildHourlyHistogram(msgs);
    expect(result[8]).toBe(1);
    expect(result[9]).toBe(1);
    expect(result[21]).toBe(1);
    expect(result[0]).toBe(0);
  });

  it('配列は必ず長さ 24', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => makeUserMessage(jstHourToUtcMs(i)));
    const result = buildHourlyHistogram(msgs);
    expect(result).toHaveLength(24);
  });

  it('UTC タイムゾーンを指定するとバケットが変わる', () => {
    // JST 8:00 = UTC 23:00 (前日)
    const jst8 = jstHourToUtcMs(8);
    const jstResult = buildHourlyHistogram([makeUserMessage(jst8)], 'Asia/Tokyo');
    const utcResult = buildHourlyHistogram([makeUserMessage(jst8)], 'UTC');
    expect(jstResult[8]).toBe(1);
    expect(utcResult[23]).toBe(1);
  });
});

describe('findPeakInRange', () => {
  const zeroHistogram = new Array(24).fill(0) as number[];

  it('全て 0 のヒストグラムでは null を返す', () => {
    expect(findPeakInRange(zeroHistogram, 5, 12)).toBeNull();
  });

  it('範囲内の最大値の時間帯を返す', () => {
    const h = [...zeroHistogram];
    h[8] = 5;
    h[10] = 3;
    expect(findPeakInRange(h, 5, 12)).toBe('08:00');
  });

  it('"HH:00" 形式で返す（1 桁の時は 0 埋め）', () => {
    const h = [...zeroHistogram];
    h[5] = 1;
    expect(findPeakInRange(h, 5, 12)).toBe('05:00');
  });

  it('2 桁の時間帯も正しくフォーマットする', () => {
    const h = [...zeroHistogram];
    h[21] = 3;
    expect(findPeakInRange(h, 17, 23)).toBe('21:00');
  });

  it('同票の場合は fromHour に近い（先の）時間帯を返す', () => {
    const h = [...zeroHistogram];
    h[8] = 2;
    h[10] = 2;
    expect(findPeakInRange(h, 5, 12)).toBe('08:00');
  });

  it('wrap-around: toHour=26 で bucket[0]〜[2] も探索する', () => {
    const h = [...zeroHistogram];
    h[1] = 5; // 翌 1 時
    h[20] = 3;
    expect(findPeakInRange(h, 17, 26)).toBe('01:00');
  });

  it('wrap-around: 夜 23 時のピーク', () => {
    const h = [...zeroHistogram];
    h[23] = 4;
    h[0] = 2;
    expect(findPeakInRange(h, 17, 26)).toBe('23:00');
  });

  it('morning range (5-12) のみ探索する', () => {
    const h = [...zeroHistogram];
    h[3] = 100; // 範囲外
    h[7] = 5;   // 範囲内
    expect(findPeakInRange(h, 5, 12)).toBe('07:00');
  });

  it('範囲が 1 時間のみでも動作する', () => {
    const h = [...zeroHistogram];
    h[8] = 1;
    expect(findPeakInRange(h, 8, 8)).toBe('08:00');
  });
});
