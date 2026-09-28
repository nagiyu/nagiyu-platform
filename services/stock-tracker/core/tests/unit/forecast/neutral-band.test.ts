import {
  computeBandHistoryTable,
  determineLean,
  determineNeutralBand,
  findBandHistoryEntry,
  resolveNeutralBandState,
  type NeutralBandHistoryPoint,
} from '../../../src/forecast/neutral-band.js';
import {
  NEUTRAL_BAND_SENTINEL_LOWER,
  NEUTRAL_BAND_SENTINEL_UPPER,
} from '../../../src/forecast/constants.js';

function repeat(n: number, d: number, y: number, base: number): NeutralBandHistoryPoint[] {
  return Array.from({ length: n }, () => ({ d, y, base }));
}

describe('determineNeutralBand', () => {
  it('件数が全て閾値未満なら寄りなし（番兵値）', () => {
    const band = determineNeutralBand(repeat(5, 0.1, 1, 0.4), { step: 0.05, minCount: 30 });
    expect(band).toEqual({
      lower: NEUTRAL_BAND_SENTINEL_LOWER,
      upper: NEUTRAL_BAND_SENTINEL_UPPER,
    });
  });

  it('上側に明確な差があれば upper が決まる', () => {
    // base=0.4 の帯: d=[0.10,0.15) に 100件、実現率 80%（有意 + 差40pt >= 3pt）
    const hist: NeutralBandHistoryPoint[] = [
      ...repeat(80, 0.12, 1, 0.4),
      ...repeat(20, 0.12, 0, 0.4),
      // d=0 を含む帯にも十分な件数を置いて「基準値を含む帯」を成立させる
      ...repeat(50, 0.0, 0, 0.4),
      ...repeat(50, 0.0, 1, 0.4),
    ];
    const band = determineNeutralBand(hist, { step: 0.05, minCount: 30 });
    expect(band.upper).toBeCloseTo(0.1, 8);
    expect(band.lower).toBe(NEUTRAL_BAND_SENTINEL_LOWER);
  });

  it('下側に明確な差があれば lower が決まる（bb + step）', () => {
    const hist: NeutralBandHistoryPoint[] = [
      ...repeat(10, 0.0, 1, 0.4),
      ...repeat(90, -0.12, 0, 0.4), // 実現率 0% (基準値 0.4 より大きく下振れ)
    ];
    const band = determineNeutralBand(hist, { step: 0.05, minCount: 30 });
    expect(band.lower).toBeCloseTo(-0.1, 8); // bb=-0.15 -> lo = bb+step = -0.10
  });

  it('差が最小差(3pt)未満なら寄りにしない', () => {
    // 実現率が基準値からわずかにしか離れていない（1pt）
    const hist: NeutralBandHistoryPoint[] = [
      ...repeat(41, 0.12, 1, 0.4),
      ...repeat(59, 0.12, 0, 0.4),
    ];
    const band = determineNeutralBand(hist, { step: 0.05, minCount: 30, minDiff: 0.03 });
    expect(band.upper).toBe(NEUTRAL_BAND_SENTINEL_UPPER);
  });
});

describe('resolveNeutralBandState', () => {
  // 両市場を合わせたカレンダー（サンプル日付の和集合）を想定。単純な連番でも
  // 「decidedOn より後で date 以下」の日数カウント（日付比較）を確認できる。
  const calendar = Array.from(
    { length: 100 },
    (_, i) =>
      `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
  );

  it('直前が null なら判定する', () => {
    const state = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[10],
      calendar,
      previous: null,
      hist: [],
    });
    expect(state.decidedOn).toBe(calendar[10]);
  });

  it('30営業日未満なら引き継ぐ', () => {
    const previous = { lower: -0.1, upper: 0.2, decidedOn: calendar[10] };
    const state = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[20], // 10 日しか経っていない
      calendar,
      previous,
      hist: [],
    });
    expect(state).toEqual(previous);
  });

  it('30営業日以上経っていれば判定し直す（decidedOn が更新される）', () => {
    const previous = { lower: -0.1, upper: 0.2, decidedOn: calendar[10] };
    const state = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[40], // 30 日経過
      calendar,
      previous,
      hist: [],
    });
    expect(state.decidedOn).toBe(calendar[40]);
  });

  it('decidedOn がカレンダーに存在しない日付でも、日付比較で正しく数える', () => {
    // decidedOn がカレンダーには無い日付（カレンダーの2つの日付の間）でも動く
    const previous = { lower: -0.1, upper: 0.2, decidedOn: '2026-01-15T12:00:00' };
    const withinInterval = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[10],
      calendar,
      previous,
      hist: [],
    });
    expect(withinInterval).toEqual(previous);

    // decidedOn ('2026-01-15T12:00:00') より後の日付は calendar[15] 以降（'2026-01-15' 自体は
    // 文字列比較で decidedOn より前になる）。30 件以上経過するのは calendar[44] 以降。
    const afterInterval = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[44],
      calendar,
      previous,
      hist: [],
    });
    expect(afterInterval.decidedOn).toBe(calendar[44]);
  });

  it('forceRecompute: true なら見直し間隔によらず必ず判定し直す', () => {
    const previous = { lower: -0.1, upper: 0.2, decidedOn: calendar[10] };
    const state = resolveNeutralBandState({
      question: 'DIR',
      date: calendar[11], // 1 日しか経っていない
      calendar,
      previous,
      hist: [],
      forceRecompute: true,
    });
    expect(state.decidedOn).toBe(calendar[11]);
  });
});

describe('computeBandHistoryTable / findBandHistoryEntry', () => {
  it('5pt刻みの帯ごとに件数・的中率を集計する', () => {
    const table = computeBandHistoryTable([
      { probability: 0.41, hit: 1 },
      { probability: 0.44, hit: 0 },
      { probability: 0.51, hit: 1 },
    ]);
    const band40 = findBandHistoryEntry(table, 0.42);
    expect(band40).toEqual({ lower: 0.4, upper: 0.45, count: 2, hitRate: 0.5 });
    const band50 = findBandHistoryEntry(table, 0.53);
    expect(band50).toEqual({ lower: 0.5, upper: 0.55, count: 1, hitRate: 1 });
  });

  it('該当する帯がなければ null', () => {
    const table = computeBandHistoryTable([{ probability: 0.1, hit: 0 }]);
    expect(findBandHistoryEntry(table, 0.9)).toBeNull();
  });
});

describe('determineLean', () => {
  const band = { lower: -0.1, upper: 0.1 };
  it('DIR: d>=upper で UP', () => {
    expect(determineLean('DIR', 0.1, band)).toBe('UP');
  });
  it('DIR: d<lower で DOWN', () => {
    expect(determineLean('DIR', -0.11, band)).toBe('DOWN');
  });
  it('DIR: それ以外は NEUTRAL', () => {
    expect(determineLean('DIR', 0, band)).toBe('NEUTRAL');
  });
  it('VOL: d>=upper で HIGH、それ以外 NEUTRAL', () => {
    expect(determineLean('VOL', 0.1, band)).toBe('HIGH');
    expect(determineLean('VOL', -0.5, band)).toBe('NEUTRAL');
  });
});
