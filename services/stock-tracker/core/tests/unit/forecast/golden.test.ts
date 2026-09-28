/**
 * ゴールデンテスト（design.md §4）。
 *
 * tasks/stock-tracker-v4/analysis/golden.py が、参照実装（prep.py・wf.py の LR・
 * decision.py の rolling_base・decision2.py の determine_band と順次寄与）で計算した期待値と、
 * TypeScript 実装（computeForDate・computeOutcomes・determineNeutralBand）の出力を
 * 許容誤差内で突き合わせる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate, computeOutcomes } from '../../../src/forecast/compute.js';
import { determineNeutralBand } from '../../../src/forecast/neutral-band.js';
import type { Market, PatternResults, Question } from '../../../src/forecast/types.js';
import type { DailyBarInput } from '../../../src/forecast/index.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
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

interface FixtureBandHistoryEntry {
  lower: number;
  upper: number;
  count: number;
  hitRate: number;
}

interface FixturePrediction {
  key: string;
  probability: number;
  contributions: Record<string, number>;
  bandHistory: FixtureBandHistoryEntry | null;
}

interface FixtureQuestionDetail {
  baseline: number;
  weights: Record<string, number>;
  standardization: Record<string, { mean: number; std: number }>;
  trainingSize: number;
  distinctTrainingDates: number;
  neutralBand: { lower: number; upper: number };
  bandHistoryTable: FixtureBandHistoryEntry[];
  predictions: FixturePrediction[];
}

interface FixtureTarget {
  market: Market;
  date: string;
  questions: Record<'DIR' | 'VOL' | 'MKT', FixtureQuestionDetail>;
}

interface FixtureTickerOutcome {
  ticker: string;
  market: Market;
  date: string;
  nextDate: string;
  nextReturn: number;
  excessReturn?: number;
  hitDir?: boolean;
  nextRange?: number;
  rangeRatio?: number;
  hitVol?: boolean;
  excludedReason?: 'EXTREME_RETURN';
}

interface FixtureMarketOutcome {
  market: Market;
  date: string;
  nextDate: string;
  nextRange: number;
  rangeRatio?: number;
  hitMkt?: boolean;
}

interface FixtureNeutralBandCase {
  label: string;
  step: number;
  minCount: number;
  minDiff: number;
  hist: { d: number; y: number; base: number }[];
  expected: { lower: number; upper: number };
}

interface Fixture {
  bars: FixtureBar[];
  targets: FixtureTarget[];
  outcomesTicker: FixtureTickerOutcome[];
  outcomesMarket: FixtureMarketOutcome[];
  neutralBandCases: FixtureNeutralBandCase[];
}

const fixture: Fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

const ALL_PATTERN_IDS = PATTERN_REGISTRY.map((p) => p.definition.patternId);

function toPatternResults(matched: string[], insufficient: string[]): PatternResults {
  const results: PatternResults = {};
  for (const id of ALL_PATTERN_IDS) {
    if (matched.includes(id)) results[id] = 'MATCHED';
    else if (insufficient.includes(id)) results[id] = 'INSUFFICIENT_DATA';
    else results[id] = 'NOT_MATCHED';
  }
  return results;
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

const EPS = 1e-6;

function expectClose(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected)).toBeLessThan(EPS + Math.abs(expected) * 1e-6);
  void label;
}

describe.each(fixture.targets)('ゴールデン: $market $date', (target) => {
  const result = computeForDate(bars, target.date, target.market, REAL_EXCHANGES, { now: 0 });

  (['DIR', 'VOL', 'MKT'] as const).forEach((question) => {
    describe(`Q-${question}`, () => {
      const expectedQ = target.questions[question];
      const snapshot = result.modelSnapshots[question as Question]!;

      it('基準値・学習サンプル数・異なる日付数が一致する', () => {
        expectClose(snapshot.baseline, expectedQ.baseline, 'baseline');
        expect(snapshot.trainingSize).toBe(expectedQ.trainingSize);
        expect(snapshot.distinctTrainingDates).toBe(expectedQ.distinctTrainingDates);
      });

      it('重み・標準化パラメータが一致する', () => {
        for (const [axisId, expectedWeight] of Object.entries(expectedQ.weights)) {
          expectClose(snapshot.weights[axisId] ?? 0, expectedWeight, `weight:${axisId}`);
        }
        for (const [axisId, expected] of Object.entries(expectedQ.standardization)) {
          const actual = snapshot.standardization[axisId];
          expect(actual).toBeDefined();
          expectClose(actual!.mean, expected.mean, `mean:${axisId}`);
          expectClose(actual!.std, expected.std, `std:${axisId}`);
        }
      });

      it('中立帯が一致する（両市場を合わせたカレンダーでの見直しを含む）', () => {
        expectClose(snapshot.neutralBand.lower, expectedQ.neutralBand.lower, 'lower');
        expectClose(snapshot.neutralBand.upper, expectedQ.neutralBand.upper, 'upper');
      });

      it('確率・寄与・確率帯の実績が、値なしの軸を含む銘柄も含めて一致する', () => {
        expect(
          question === 'MKT' ? (result.marketForecast ? 1 : 0) : result.tickers.length
        ).toBeGreaterThan(0);
        for (const prediction of expectedQ.predictions) {
          const record =
            question === 'MKT'
              ? result.marketForecast?.probabilities.MKT
              : result.tickers.find((t) => t.tickerId === prediction.key)?.probabilities[
                  question as 'DIR' | 'VOL'
                ];
          expect(record).toBeDefined();
          expectClose(record!.probability, prediction.probability, `${prediction.key} probability`);
          for (const [axisId, expectedContribution] of Object.entries(prediction.contributions)) {
            expectClose(
              record!.contributions[axisId] ?? 0,
              expectedContribution,
              `${prediction.key} contribution:${axisId}`
            );
          }
          if (prediction.bandHistory === null) {
            expect(record!.bandHistory).toBeNull();
          } else {
            expect(record!.bandHistory).not.toBeNull();
            expect(record!.bandHistory!.count).toBe(prediction.bandHistory.count);
            expectClose(
              record!.bandHistory!.hitRate,
              prediction.bandHistory.hitRate,
              'bandHistory hitRate'
            );
          }
        }
        // 銘柄数・市場の有無が期待値と一致する（値なしの軸を理由に除外されていないことの確認。指摘 C-3）
        if (question === 'MKT') {
          expect(expectedQ.predictions.length).toBeLessThanOrEqual(1);
        } else {
          const withRecord = result.tickers.filter(
            (t) => t.probabilities[question as 'DIR' | 'VOL'] !== undefined
          );
          expect(withRecord.length).toBe(expectedQ.predictions.length);
        }
      });
    });
  });
});

describe('ゴールデン: 実績（採点）の突き合わせ（指摘 B-1・B-2）', () => {
  const { tickerOutcomes, marketOutcomes } = computeOutcomes(bars, 0, REAL_EXCHANGES);

  it('銘柄の採点（超過リターン・値幅比・的中・除外理由）が一致する', () => {
    expect(fixture.outcomesTicker.length).toBeGreaterThan(0);
    for (const expected of fixture.outcomesTicker) {
      const actual = tickerOutcomes.find(
        (o) =>
          o.tickerId === expected.ticker && o.market === expected.market && o.date === expected.date
      );
      expect(actual).toBeDefined();
      expect(actual!.nextDate).toBe(expected.nextDate);
      expectClose(actual!.nextReturn, expected.nextReturn, 'nextReturn');
      if (expected.excludedReason) {
        expect(actual!.excludedReason).toBe('EXTREME_RETURN');
        expect(actual!.hit.DIR).toBeUndefined();
        expect(actual!.hit.VOL).toBeUndefined();
      } else {
        expect(actual!.excludedReason).toBeUndefined();
        expectClose(actual!.excessReturn!, expected.excessReturn!, 'excessReturn');
        expect(actual!.hit.DIR).toBe(expected.hitDir);
      }
      if (expected.nextRange !== undefined) {
        // design.md §1.1: 値幅は比率（(翌日高値-翌日安値)÷基準日終値）で、生の価格差ではない（指摘 B-1）
        expectClose(actual!.nextRange, expected.nextRange, 'nextRange');
      }
      if (expected.rangeRatio !== undefined) {
        expectClose(actual!.rangeRatio!, expected.rangeRatio, 'rangeRatio');
        expect(actual!.hit.VOL).toBe(expected.hitVol);
      }
    }
  });

  it('市場の採点（値幅比・的中）が一致する', () => {
    expect(fixture.outcomesMarket.length).toBeGreaterThan(0);
    for (const expected of fixture.outcomesMarket) {
      const actual = marketOutcomes.find(
        (o) => o.market === expected.market && o.date === expected.date
      );
      expect(actual).toBeDefined();
      expect(actual!.nextDate).toBe(expected.nextDate);
      expectClose(actual!.nextRange, expected.nextRange, 'nextRange');
      if (expected.rangeRatio !== undefined) {
        expectClose(actual!.rangeRatio!, expected.rangeRatio, 'rangeRatio');
        expect(actual!.hit.MKT).toBe(expected.hitMkt);
      }
    }
  });
});

describe('ゴールデン: 中立帯の有意なケース（指摘 C-2）', () => {
  it.each(fixture.neutralBandCases)('$label', (testCase) => {
    const band = determineNeutralBand(testCase.hist, {
      step: testCase.step,
      minCount: testCase.minCount,
      minDiff: testCase.minDiff,
    });
    expectClose(band.lower, testCase.expected.lower, 'lower');
    expectClose(band.upper, testCase.expected.upper, 'upper');
  });
});

describe('ゴールデン: 最大誤差レポート', () => {
  it('全評価対象で確率の誤差が 1e-6 未満', () => {
    let maxDiff = 0;
    for (const target of fixture.targets) {
      const result = computeForDate(bars, target.date, target.market, REAL_EXCHANGES, { now: 0 });
      (['DIR', 'VOL', 'MKT'] as const).forEach((question) => {
        for (const prediction of target.questions[question].predictions) {
          const record =
            question === 'MKT'
              ? result.marketForecast?.probabilities.MKT
              : result.tickers.find((t) => t.tickerId === prediction.key)?.probabilities[
                  question as 'DIR' | 'VOL'
                ];
          if (!record) return;
          maxDiff = Math.max(maxDiff, Math.abs(record.probability - prediction.probability));
        }
      });
    }
    console.log(`golden max probability diff = ${maxDiff}`);
    expect(maxDiff).toBeLessThan(1e-6);
  });
});
