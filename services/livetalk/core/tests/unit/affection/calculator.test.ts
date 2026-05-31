import {
  calculateAffectionDelta,
  calculateBidirectionalityDelta,
  isNewActiveDay,
  updateAffectionLevel,
} from '../../../src/affection/calculator.js';
import {
  AFFECTION_BIDIRECTIONALITY_WEIGHT,
  AFFECTION_INFO_DISCLOSURE_WEIGHT,
  AFFECTION_TIME_CONTINUITY_BONUS,
} from '../../../src/constants.js';

describe('calculateAffectionDelta', () => {
  it('infoDisclosure が 0 かつ新規接触日でなければ delta は 0', () => {
    expect(
      calculateAffectionDelta({ infoDisclosure: 0, isNewActiveDay: false })
    ).toBe(0);
  });

  it('infoDisclosure 1 件で delta = AFFECTION_INFO_DISCLOSURE_WEIGHT', () => {
    const delta = calculateAffectionDelta({ infoDisclosure: 1, isNewActiveDay: false });
    expect(delta).toBe(AFFECTION_INFO_DISCLOSURE_WEIGHT);
  });

  it('infoDisclosure 3 件で delta = 3 * AFFECTION_INFO_DISCLOSURE_WEIGHT', () => {
    const delta = calculateAffectionDelta({ infoDisclosure: 3, isNewActiveDay: false });
    expect(delta).toBeCloseTo(3 * AFFECTION_INFO_DISCLOSURE_WEIGHT);
  });

  it('新規接触日なら delta += AFFECTION_TIME_CONTINUITY_BONUS', () => {
    const delta = calculateAffectionDelta({ infoDisclosure: 0, isNewActiveDay: true });
    expect(delta).toBe(AFFECTION_TIME_CONTINUITY_BONUS);
  });

  it('両軸が揃った場合に合算される', () => {
    const delta = calculateAffectionDelta({ infoDisclosure: 2, isNewActiveDay: true });
    expect(delta).toBeCloseTo(
      2 * AFFECTION_INFO_DISCLOSURE_WEIGHT + AFFECTION_TIME_CONTINUITY_BONUS
    );
  });
});

describe('calculateBidirectionalityDelta', () => {
  it('score 0 は delta 0', () => {
    expect(calculateBidirectionalityDelta(0)).toBe(0);
  });

  it('score 1 は delta = AFFECTION_BIDIRECTIONALITY_WEIGHT', () => {
    expect(calculateBidirectionalityDelta(1)).toBe(AFFECTION_BIDIRECTIONALITY_WEIGHT);
  });

  it('score 0.5 は delta = 0.5 * AFFECTION_BIDIRECTIONALITY_WEIGHT', () => {
    expect(calculateBidirectionalityDelta(0.5)).toBeCloseTo(
      0.5 * AFFECTION_BIDIRECTIONALITY_WEIGHT
    );
  });
});

describe('updateAffectionLevel', () => {
  it('delta が正なら currentLevel を上回る新しい値を返す', () => {
    expect(updateAffectionLevel(5, 2)).toBe(7);
  });

  it('delta が 0 なら変わらない', () => {
    expect(updateAffectionLevel(5, 0)).toBe(5);
  });

  it('delta が負でも currentLevel より下がらない（上昇のみ保証）', () => {
    expect(updateAffectionLevel(5, -3)).toBe(5);
  });

  it('currentLevel が 0 の初期状態から上昇する', () => {
    expect(updateAffectionLevel(0, 1.5)).toBeCloseTo(1.5);
  });
});

describe('isNewActiveDay', () => {
  const day1Start = new Date('2024-01-15T00:00:00Z').getTime();
  const day1End   = new Date('2024-01-15T23:59:59Z').getTime();
  const day2Start = new Date('2024-01-16T00:00:00Z').getTime();

  it('prev が undefined なら初回接触として true', () => {
    expect(isNewActiveDay(undefined, day1Start)).toBe(true);
  });

  it('同一日内の複数接触は false', () => {
    expect(isNewActiveDay(day1Start, day1End)).toBe(false);
  });

  it('日付をまたいだら true', () => {
    expect(isNewActiveDay(day1End, day2Start)).toBe(true);
  });

  it('UTC 基準で判定するため JST 0:00（UTC 前日 15:00）は同日扱いになり得る', () => {
    // UTC 2024-01-15 14:00 と 2024-01-15 15:00 は同日 → false
    const utcSameDay1 = new Date('2024-01-15T14:00:00Z').getTime();
    const utcSameDay2 = new Date('2024-01-15T15:00:00Z').getTime();
    expect(isNewActiveDay(utcSameDay1, utcSameDay2)).toBe(false);
  });
});
