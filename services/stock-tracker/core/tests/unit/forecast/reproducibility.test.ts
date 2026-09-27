/**
 * 再現性テスト（NFR-3・design.md §4）。
 *
 * 同じ入力で 2 回実行し、完全一致することを確認する（乱数を使わない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate, computeOutcomes } from '../../../src/forecast/compute.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type {
  DailyBarInput,
  ForecastHistory,
  PatternResults,
} from '../../../src/forecast/index.js';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'golden.json');
interface FixtureBar {
  tickerId: string;
  exchangeId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  createdAt: number;
  patternsMatched: string[];
  patternsInsufficient: string[];
}
const fixture: { bars: FixtureBar[] } = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
const ALL_PATTERN_IDS = PATTERN_REGISTRY.map((p) => p.definition.patternId);

function toPatternResults(matched: string[], insufficient: string[]): PatternResults {
  const r: PatternResults = {};
  for (const id of ALL_PATTERN_IDS) {
    r[id] = matched.includes(id)
      ? 'MATCHED'
      : insufficient.includes(id)
        ? 'INSUFFICIENT_DATA'
        : 'NOT_MATCHED';
  }
  return r;
}

const bars: DailyBarInput[] = fixture.bars.map((b) => ({
  tickerId: b.tickerId,
  exchangeId: b.exchangeId,
  date: b.date,
  open: b.open,
  high: b.high,
  low: b.low,
  close: b.close,
  volume: b.volume ?? undefined,
  createdAt: b.createdAt,
  patternResults: toPatternResults(b.patternsMatched, b.patternsInsufficient),
}));

const history: ForecastHistory = {
  bars,
  knownDirSamples: [],
  knownVolSamples: [],
  knownMktSamples: [],
};

describe('再現性', () => {
  it('computeForDate は同じ入力から同じ結果を返す（2 回実行して完全一致）', () => {
    const first = computeForDate(history, '2024-04-19', 'JP', { now: 12345 });
    const second = computeForDate(history, '2024-04-19', 'JP', { now: 12345 });
    expect(second).toEqual(first);
  });

  it('computeForDate は US 側でも再現する', () => {
    const first = computeForDate(history, '2024-04-22', 'US', { now: 12345 });
    const second = computeForDate(history, '2024-04-22', 'US', { now: 12345 });
    expect(second).toEqual(first);
  });

  it('computeOutcomes は同じ入力から同じ結果を返す', () => {
    const first = computeOutcomes(bars, 999);
    const second = computeOutcomes(bars, 999);
    expect(second).toEqual(first);
  });

  it('入力配列の順序を変えても、銘柄ごとの確率はほぼ一致する（浮動小数点の丸め誤差の範囲）', () => {
    // 銘柄の並び順や集計の加算順が変わると、浮動小数点演算の丸め誤差（最終桁）で厳密一致しない
    // ことがある。NFR-3 が求める再現性は「同じ入力から同じ結果」であり、入力の並び替えに対する
    // ビット単位の不変性までは求めていないため、ここでは許容誤差つきで確認する。
    const shuffled = [...bars].reverse();
    const a = computeForDate({ ...history, bars }, '2024-04-19', 'JP', { now: 0 });
    const b = computeForDate({ ...history, bars: shuffled }, '2024-04-19', 'JP', { now: 0 });
    const byTicker = (r: typeof a) => new Map(r.tickers.map((t) => [t.tickerId, t]));
    const aMap = byTicker(a);
    const bMap = byTicker(b);
    expect(bMap.size).toBe(aMap.size);
    for (const [tickerId, aTicker] of aMap) {
      const bTicker = bMap.get(tickerId)!;
      expect(bTicker.probabilities.DIR?.probability).toBeCloseTo(
        aTicker.probabilities.DIR?.probability ?? 0,
        9
      );
      expect(bTicker.probabilities.VOL?.probability).toBeCloseTo(
        aTicker.probabilities.VOL?.probability ?? 0,
        9
      );
    }
    expect(b.marketForecast.probabilities.MKT?.probability).toBeCloseTo(
      a.marketForecast.probabilities.MKT?.probability ?? 0,
      9
    );
  });
});
