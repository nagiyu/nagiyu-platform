/**
 * 市場をまたぐケース（design.md §4）。
 *
 * 「JP の D の予測に、US の D−1 の実績（US の D の引けで確定）が入らないこと」を、
 * 明示的なテストケースとして持つ。US の D のバーを大きく変えても JP の D の予測が変わらない
 * ことで検証する（US の D のバーは、US の D−1 の翌営業日レコードであり、そのラベルは
 * US の D の引けで確定するため、JP の D の予測には使えない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
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

const TARGET_DATE = '2024-04-19';

function historyWith(bars: DailyBarInput[]): ForecastHistory {
  return { bars, knownDirSamples: [], knownVolSamples: [], knownMktSamples: [] };
}

describe('市場をまたぐケース', () => {
  it('US の D のバーを大きく変えても JP の D の予測は変わらない（US の D は US の D の引けで確定するため）', () => {
    const baseline = computeForDate(historyWith(allBars), TARGET_DATE, 'JP', { now: 0 });

    const perturbed = allBars.map((bar) =>
      bar.tickerId === 'UT1' && bar.date === TARGET_DATE
        ? {
            ...bar,
            open: bar.open * 3,
            high: bar.high * 3,
            low: bar.low * 0.3,
            close: bar.close * 3,
            volume: (bar.volume ?? 1000) * 50,
          }
        : bar
    );
    const perturbedResult = computeForDate(historyWith(perturbed), TARGET_DATE, 'JP', { now: 0 });

    expect(perturbedResult).toEqual(baseline);
  });

  it('（対照）JP の過去のバーを大きく変えると JP の D の予測は変わる', () => {
    const baseline = computeForDate(historyWith(allBars), TARGET_DATE, 'JP', { now: 0 });

    const perturbed = allBars.map((bar) =>
      bar.tickerId === 'JT1' && bar.date === '2024-02-01'
        ? {
            ...bar,
            open: bar.open * 3,
            high: bar.high * 3,
            low: bar.low * 0.3,
            close: bar.close * 3,
            volume: (bar.volume ?? 1000) * 50,
          }
        : bar
    );
    const perturbedResult = computeForDate(historyWith(perturbed), TARGET_DATE, 'JP', { now: 0 });

    expect(perturbedResult).not.toEqual(baseline);
  });
});
