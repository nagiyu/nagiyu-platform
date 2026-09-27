/**
 * ゴールデンテスト（design.md §4）。
 *
 * tasks/stock-tracker-v4/analysis/golden.py が、参照実装（prep.py・wf.py の LR・
 * decision.py の rolling_base・decision2.py の determine_band と順次寄与）で計算した期待値と、
 * TypeScript 実装（computeForDate）の出力を許容誤差内で突き合わせる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
import type {
  DailyBarInput,
  ForecastHistory,
  KnownProbabilitySample,
  Market,
  Question,
} from '../../../src/forecast/types.js';
import type { PatternResults } from '../../../src/types.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';

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

interface FixtureKnownSample {
  market: Market;
  date: string;
  probability: number;
  baseline: number;
  hit: boolean;
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
  knownSamples: FixtureKnownSample[];
  predictions: FixturePrediction[];
}

interface FixtureTarget {
  market: Market;
  date: string;
  questions: Record<'DIR' | 'VOL' | 'MKT', FixtureQuestionDetail>;
}

interface Fixture {
  bars: FixtureBar[];
  targets: FixtureTarget[];
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

function toKnownSamples(samples: FixtureKnownSample[]): KnownProbabilitySample[] {
  return samples.map((s) => ({
    market: s.market,
    date: s.date,
    probability: s.probability,
    baseline: s.baseline,
    hit: s.hit,
  }));
}

const EPS = 1e-6;

function expectClose(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected)).toBeLessThan(EPS + Math.abs(expected) * 1e-6);
  void label;
}

describe.each(fixture.targets)('ゴールデン: $market $date', (target) => {
  const history: ForecastHistory = {
    bars,
    knownDirSamples: toKnownSamples(target.questions.DIR.knownSamples),
    knownVolSamples: toKnownSamples(target.questions.VOL.knownSamples),
    knownMktSamples: toKnownSamples(target.questions.MKT.knownSamples),
  };

  const result = computeForDate(history, target.date, target.market, { now: 0 });

  (['DIR', 'VOL', 'MKT'] as const).forEach((question) => {
    describe(`Q-${question}`, () => {
      const expectedQ = target.questions[question];
      const snapshot = result.modelSnapshots[question as Question]!;

      it('基準値が一致する', () => {
        expectClose(snapshot.baseline, expectedQ.baseline, 'baseline');
      });

      it('学習サンプル数・異なる日付数が一致する', () => {
        expect(snapshot.trainingSize).toBe(expectedQ.trainingSize);
      });

      it('重みが一致する', () => {
        for (const [axisId, expectedWeight] of Object.entries(expectedQ.weights)) {
          expectClose(snapshot.weights[axisId] ?? 0, expectedWeight, `weight:${axisId}`);
        }
      });

      it('標準化パラメータが一致する', () => {
        for (const [axisId, expected] of Object.entries(expectedQ.standardization)) {
          const actual = snapshot.standardization[axisId];
          expect(actual).toBeDefined();
          expectClose(actual!.mean, expected.mean, `mean:${axisId}`);
          expectClose(actual!.std, expected.std, `std:${axisId}`);
        }
      });

      it('中立帯が一致する', () => {
        expectClose(snapshot.neutralBand.lower, expectedQ.neutralBand.lower, 'lower');
        expectClose(snapshot.neutralBand.upper, expectedQ.neutralBand.upper, 'upper');
      });

      it('確率・寄与・確率帯の実績が一致する', () => {
        for (const prediction of expectedQ.predictions) {
          const record =
            question === 'MKT'
              ? result.marketForecast.probabilities.MKT
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
      });
    });
  });
});

describe('ゴールデン: 最大誤差レポート', () => {
  it('全評価対象で確率の誤差が 1e-6 未満', () => {
    let maxDiff = 0;
    for (const target of fixture.targets) {
      const history: ForecastHistory = {
        bars,
        knownDirSamples: toKnownSamples(target.questions.DIR.knownSamples),
        knownVolSamples: toKnownSamples(target.questions.VOL.knownSamples),
        knownMktSamples: toKnownSamples(target.questions.MKT.knownSamples),
      };
      const result = computeForDate(history, target.date, target.market, { now: 0 });
      (['DIR', 'VOL', 'MKT'] as const).forEach((question) => {
        for (const prediction of target.questions[question].predictions) {
          const record =
            question === 'MKT'
              ? result.marketForecast.probabilities.MKT
              : result.tickers.find((t) => t.tickerId === prediction.key)?.probabilities[
                  question as 'DIR' | 'VOL'
                ];
          if (!record) return;
          maxDiff = Math.max(maxDiff, Math.abs(record.probability - prediction.probability));
        }
      });
    }
    // eslint-disable-next-line no-console
    console.log(`golden max probability diff = ${maxDiff}`);
    expect(maxDiff).toBeLessThan(1e-6);
  });
});
