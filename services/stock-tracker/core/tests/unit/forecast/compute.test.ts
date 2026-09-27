/**
 * computeForDate / computeOutcomes の振る舞いテスト（バーンイン・寄与の合計・件数不足の目印等）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate, computeOutcomes } from '../../../src/forecast/compute.js';
import { MIN_TRAINING_DATES } from '../../../src/forecast/constants.js';
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

const allBars: DailyBarInput[] = fixture.bars.map((b) => ({
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

function historyWith(bars: DailyBarInput[]): ForecastHistory {
  return { bars, knownDirSamples: [], knownVolSamples: [], knownMktSamples: [] };
}

describe('バーンイン（design.md §1.6）', () => {
  it('学習サンプルの異なる日付が MIN_TRAINING_DATES 未満なら Probabilities を出さない', () => {
    // 最初の数日分だけを渡す（バーンインを満たさない）
    const earlyBars = allBars.filter((b) => b.date <= '2024-01-10');
    const result = computeForDate(historyWith(earlyBars), '2024-01-10', 'JP', { now: 0 });
    for (const ticker of result.tickers) {
      expect(ticker.probabilities.DIR).toBeUndefined();
      expect(ticker.probabilities.VOL).toBeUndefined();
    }
    expect(result.marketForecast.probabilities.MKT).toBeUndefined();
  });

  it('十分な学習サンプルがあれば Probabilities.DIR が出る', () => {
    const result = computeForDate(historyWith(allBars), '2024-04-19', 'JP', { now: 0 });
    const withDir = result.tickers.filter((t) => t.probabilities.DIR !== undefined);
    expect(withDir.length).toBeGreaterThan(0);
    expect(result.modelSnapshots.DIR!.trainingSize).toBeGreaterThanOrEqual(MIN_TRAINING_DATES);
  });
});

describe('平常が無い銘柄は VOL を出さない（DIR は出す）', () => {
  it('20レコード未満の銘柄（学習期間の最初の方）は VOL 無し・DIR は出る', () => {
    // バーンインを満たすところまでデータを与えつつ、対象日を非常に早い日（20レコード未満）にする
    // ことはできない（対象日自身がバーンインを満たさなくなるため）。
    // 代わりに、対象日の少し前に新規上場した「20レコード未満」の銘柄を混ぜて確認する。
    const lateStartTicker = allBars
      .filter((b) => b.tickerId === 'JT1' && b.date >= '2024-04-01' && b.date <= '2024-04-19')
      .map((b) => ({ ...b, tickerId: 'NEWCOMER' }));
    const combined = [...allBars, ...lateStartTicker];
    const result = computeForDate(historyWith(combined), '2024-04-19', 'JP', { now: 0 });
    const newcomer = result.tickers.find((t) => t.tickerId === 'NEWCOMER')!;
    expect(newcomer).toBeDefined();
    expect(newcomer.normal.range).toBeUndefined();
    expect(newcomer.probabilities.VOL).toBeUndefined();
    expect(newcomer.probabilities.DIR).toBeDefined();
  });
});

describe('寄与の合計（design.md §1.4）', () => {
  it('寄与の合計は「確率 − 基準値」に一致する', () => {
    const result = computeForDate(historyWith(allBars), '2024-04-19', 'JP', { now: 0 });
    for (const ticker of result.tickers) {
      for (const key of ['DIR', 'VOL'] as const) {
        const record = ticker.probabilities[key];
        if (!record) continue;
        const sum = Object.values(record.contributions).reduce((a, b) => a + (b ?? 0), 0);
        expect(sum).toBeCloseTo(record.probability - record.baseline, 8);
      }
    }
    const mkt = result.marketForecast.probabilities.MKT;
    if (mkt) {
      const sum = Object.values(mkt.contributions).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum).toBeCloseTo(mkt.probability - mkt.baseline, 8);
    }
  });
});

describe('件数不足の目印（design.md §1.4）', () => {
  it('学習サンプル中の点灯回数が30未満の点灯型軸は lowSampleAxes に含まれる', () => {
    // 「morning-star」だけほとんど MATCHED しない小さな合成データを作り、
    // 件数不足の目印が付くことを確認する。
    const dates: string[] = [];
    let cursor = new Date('2024-01-02T00:00:00Z');
    while (dates.length < 40) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 86400000);
    }
    const rareBars: DailyBarInput[] = [];
    for (const tickerId of ['A', 'B']) {
      let price = 1000;
      dates.forEach((date, i) => {
        price += tickerId === 'A' ? 1 : -1;
        const patternResults: PatternResults =
          i === 5 ? { 'morning-star': 'MATCHED' } : { 'morning-star': 'NOT_MATCHED' };
        rareBars.push({
          tickerId,
          exchangeId: 'TSE',
          date,
          open: price,
          high: price + 5,
          low: price - 5,
          close: price + (i % 2 === 0 ? 1 : -1),
          volume: 1000 + i,
          createdAt: new Date(`${date}T00:00:00Z`).getTime(),
          patternResults,
        });
      });
    }
    const targetDate = dates[dates.length - 1];
    const result = computeForDate(historyWith(rareBars), targetDate, 'JP', { now: 0 });
    const snapshot = result.modelSnapshots.DIR!;
    expect(snapshot.axisStats['morning-star']?.lowSample).toBe(true);
    expect(snapshot.axisStats['morning-star']!.count).toBeLessThan(30);
    const ticker = result.tickers.find((t) => t.probabilities.DIR !== undefined)!;
    expect(ticker.probabilities.DIR!.lowSampleAxes).toContain('morning-star');
  });

  it('数値型軸は lowSample が付かない', () => {
    const result = computeForDate(historyWith(allBars), '2024-04-19', 'JP', { now: 0 });
    const snapshot = result.modelSnapshots.VOL!;
    for (const stats of Object.values(snapshot.axisStats)) {
      expect(stats!.lowSample).toBe(false);
    }
  });
});

describe('AxisValues は FLAG を boolean、NUMERIC を数値で持つ', () => {
  it('パターン軸は boolean、大きさ軸は数値', () => {
    const result = computeForDate(historyWith(allBars), '2024-04-19', 'JP', { now: 0 });
    const ticker = result.tickers[0];
    expect(typeof ticker.axisValues['morning-star']).toBe('boolean');
    if (ticker.axisValues['range-today'] !== undefined) {
      expect(typeof ticker.axisValues['range-today']).toBe('number');
    }
  });
});

describe('computeOutcomes: 市場の採点（Q-MKT）', () => {
  it('翌日の市場平均値幅が平常を上回れば的中', () => {
    const { marketOutcomes } = computeOutcomes(allBars, 1);
    expect(marketOutcomes.length).toBeGreaterThan(0);
    for (const outcome of marketOutcomes) {
      if (outcome.rangeRatio !== undefined) {
        expect(outcome.hit.MKT).toBe(outcome.rangeRatio > 1);
      }
    }
  });
});
