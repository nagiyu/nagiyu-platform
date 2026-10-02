/**
 * computeForDate / computeOutcomes の振る舞いテスト（バーンイン・寄与の合計・件数不足の目印・
 * D の足が無い日の契約・未対応 ExchangeID の扱い等）。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeForDate,
  computeOutcomes,
  hasEnoughTrainingData,
} from '../../../src/forecast/compute.js';
import { MIN_TRAINING_DATES } from '../../../src/forecast/constants.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type {
  DailyBarInput,
  ModelSnapshotItem,
  PatternResults,
} from '../../../src/forecast/index.js';
import { REAL_EXCHANGES } from './support/exchanges.js';

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

// computeForDate（bars だけのリプレイ便宜関数）は、対象日までの全期間を毎回学習し直すため
// 呼び出しごとにコストがかかる。同じ (bars, date, market) の結果を複数の it() で使うときは
// beforeAll で 1 回だけ計算して共有する（テストの意図はそのまま、実行時間だけを縮める）。
let sharedResult: ReturnType<typeof computeForDate>;
beforeAll(() => {
  sharedResult = computeForDate(allBars, '2024-03-18', 'JP', REAL_EXCHANGES, { now: 0 });
});

describe('バーンイン', () => {
  it('学習サンプルの異なる日付が MIN_TRAINING_DATES 未満なら Probabilities を出さない', () => {
    // 最初の数日分だけを渡す（バーンインを満たさない）
    const earlyBars = allBars.filter((b) => b.date <= '2024-01-10');
    const result = computeForDate(earlyBars, '2024-01-10', 'JP', REAL_EXCHANGES, { now: 0 });
    for (const ticker of result.tickers) {
      expect(ticker.probabilities.DIR).toBeUndefined();
      expect(ticker.probabilities.VOL).toBeUndefined();
    }
    expect(result.marketForecast?.probabilities.MKT).toBeUndefined();
  });

  it('十分な学習サンプルがあれば Probabilities.DIR が出る', () => {
    const withDir = sharedResult.tickers.filter((t) => t.probabilities.DIR !== undefined);
    expect(withDir.length).toBeGreaterThan(0);
    expect(sharedResult.modelSnapshots.DIR!.trainingSize).toBeGreaterThan(0);
  });
});

describe('hasEnoughTrainingData', () => {
  const base: ModelSnapshotItem = {
    question: 'DIR',
    market: 'JP',
    date: '2026-01-01',
    modelVersion: 'v',
    alpha: 80,
    weights: {},
    standardization: {},
    baseline: 0.5,
    neutralBand: { lower: -1, upper: 1, decidedOn: '2026-01-01' },
    bandHistory: [],
    axisStats: {},
    trainingSize: 0,
    distinctTrainingDates: 0,
    createdAt: 0,
  };

  it('MIN_TRAINING_DATES 未満なら false', () => {
    expect(hasEnoughTrainingData({ ...base, distinctTrainingDates: MIN_TRAINING_DATES - 1 })).toBe(
      false
    );
  });

  it('MIN_TRAINING_DATES 以上なら true', () => {
    expect(hasEnoughTrainingData({ ...base, distinctTrainingDates: MIN_TRAINING_DATES })).toBe(
      true
    );
  });
});

describe('平常が無い銘柄は VOL を出さない（DIR は出す）', () => {
  it('20レコード未満の銘柄（学習期間の最初の方）は VOL 無し・DIR は出る', () => {
    // バーンインを満たすところまでデータを与えつつ、対象日を非常に早い日（20レコード未満）にする
    // ことはできない（対象日自身がバーンインを満たさなくなるため）。
    // 代わりに、対象日の少し前に新規上場した「20レコード未満」の銘柄を混ぜて確認する。
    const lateStartTicker = allBars
      .filter((b) => b.tickerId === 'JT1' && b.date >= '2024-02-27' && b.date <= '2024-03-18')
      .map((b) => ({ ...b, tickerId: 'NEWCOMER' }));
    const combined = [...allBars, ...lateStartTicker];
    const result = computeForDate(combined, '2024-03-18', 'JP', REAL_EXCHANGES, { now: 0 });
    const newcomer = result.tickers.find((t) => t.tickerId === 'NEWCOMER')!;
    expect(newcomer).toBeDefined();
    expect(newcomer.normal.range).toBeUndefined();
    expect(newcomer.probabilities.VOL).toBeUndefined();
    expect(newcomer.probabilities.DIR).toBeDefined();
  });
});

describe('寄与の合計', () => {
  it('寄与の合計は「確率 − 基準値」に一致する', () => {
    const result = sharedResult;
    for (const ticker of result.tickers) {
      for (const key of ['DIR', 'VOL'] as const) {
        const record = ticker.probabilities[key];
        if (!record) continue;
        const sum = Object.values(record.contributions).reduce((a, b) => a + (b ?? 0), 0);
        expect(sum).toBeCloseTo(record.probability - record.baseline, 8);
      }
    }
    const mkt = result.marketForecast?.probabilities.MKT;
    if (mkt) {
      const sum = Object.values(mkt.contributions).reduce((a, b) => a + (b ?? 0), 0);
      expect(sum).toBeCloseTo(mkt.probability - mkt.baseline, 8);
    }
  });
});

describe('件数不足の目印', () => {
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
    const result = computeForDate(rareBars, targetDate, 'JP', REAL_EXCHANGES, { now: 0 });
    const snapshot = result.modelSnapshots.DIR!;
    expect(snapshot.axisStats['morning-star']?.lowSample).toBe(true);
    expect(snapshot.axisStats['morning-star']!.count).toBeLessThan(30);
    const ticker = result.tickers.find((t) => t.probabilities.DIR !== undefined)!;
    expect(ticker.probabilities.DIR!.lowSampleAxes).toContain('morning-star');
  });

  it('数値型軸は lowSample が付かない', () => {
    const snapshot = sharedResult.modelSnapshots.VOL!;
    for (const stats of Object.values(snapshot.axisStats)) {
      expect(stats!.lowSample).toBe(false);
    }
  });
});

describe('AxisValues は FLAG を boolean、NUMERIC を数値で持つ', () => {
  it('パターン軸は boolean、大きさ軸は数値', () => {
    const ticker = sharedResult.tickers[0];
    expect(typeof ticker.axisValues['morning-star']).toBe('boolean');
    if (ticker.axisValues['range-today'] !== undefined) {
      expect(typeof ticker.axisValues['range-today']).toBe('number');
    }
  });
});

describe('D の足が無い日の契約', () => {
  it('その市場・日の観測が無ければ、NaN を出さず空の結果を返す', () => {
    const result = computeForDate(allBars, '1999-01-01', 'JP', REAL_EXCHANGES, { now: 0 });
    expect(result.tickers).toEqual([]);
    expect(result.marketForecast).toBeUndefined();
    expect(result.modelSnapshots).toEqual({});
  });

  it('US 側でも同様に空の結果を返す', () => {
    const result = computeForDate(allBars, '1999-01-01', 'US', REAL_EXCHANGES, { now: 0 });
    expect(result.tickers).toEqual([]);
    expect(result.marketForecast).toBeUndefined();
  });
});

describe('未対応の ExchangeID', () => {
  it('未対応の ExchangeID のバーは除外して続行し、skippedExchangeIds に残す', () => {
    const withUnknown: DailyBarInput[] = [
      ...allBars,
      {
        tickerId: 'XX1',
        exchangeId: 'LSE',
        date: '2024-03-18',
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000,
        createdAt: 0,
      },
    ];
    const result = computeForDate(withUnknown, '2024-03-18', 'JP', REAL_EXCHANGES, { now: 0 });
    expect(result.skippedExchangeIds).toContain('LSE');
    // LSE の銘柄は結果に含まれない
    expect(result.tickers.find((t) => t.tickerId === 'XX1')).toBeUndefined();
    // 他の銘柄の計算は継続する
    expect(result.tickers.length).toBeGreaterThan(0);
  });
});

describe('computeOutcomes: 銘柄の採点（Q-VOL）', () => {
  it('翌日の値幅（比率）が平常を上回れば的中し、値幅は生の価格差ではなく比率で表す', () => {
    const { tickerOutcomes } = computeOutcomes(allBars, 1, REAL_EXCHANGES);
    expect(tickerOutcomes.length).toBeGreaterThan(0);
    for (const outcome of tickerOutcomes) {
      // 値幅は比率: 常識的な範囲（0〜数十%）に収まる
      expect(outcome.nextRange).toBeGreaterThan(0);
      expect(outcome.nextRange).toBeLessThan(1);
      if (outcome.rangeRatio !== undefined) {
        expect(outcome.hit.VOL).toBe(outcome.rangeRatio > 1);
      }
    }
  });
});

describe('computeOutcomes: 市場の採点（Q-MKT）', () => {
  it('翌日の市場平均値幅が平常を上回れば的中', () => {
    const { marketOutcomes } = computeOutcomes(allBars, 1, REAL_EXCHANGES);
    expect(marketOutcomes.length).toBeGreaterThan(0);
    for (const outcome of marketOutcomes) {
      expect(outcome.nextRange).toBeGreaterThan(0);
      expect(outcome.nextRange).toBeLessThan(1);
      if (outcome.rangeRatio !== undefined) {
        expect(outcome.hit.MKT).toBe(outcome.rangeRatio > 1);
      }
    }
  });
});
