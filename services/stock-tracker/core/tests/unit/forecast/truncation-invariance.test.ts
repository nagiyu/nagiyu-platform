/**
 * 切り詰め不変性テスト（design.md §4）。
 *
 * 同じ D・市場について、「全期間のデータ」と「その時点で確定していないものを名目引け時刻で
 * 切り落としたデータ」で computeForDate の出力が完全一致することを、フィクスチャの全日付・
 * 両市場で確認する。将来のデータを1件でも参照していれば差が出る。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
import { buildObservationCalendar } from '../../../src/forecast/preprocessing.js';
import { getMarketForExchange, nominalCloseTime } from '../../../src/forecast/time.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type {
  DailyBarInput,
  ForecastHistory,
  Market,
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

const calendar = buildObservationCalendar(allBars);

function truncate(bars: readonly DailyBarInput[], date: string, market: Market): DailyBarInput[] {
  const cutoff = nominalCloseTime(date, market);
  return bars.filter(
    (bar) => nominalCloseTime(bar.date, getMarketForExchange(bar.exchangeId)) <= cutoff
  );
}

const history: ForecastHistory = {
  bars: allBars,
  knownDirSamples: [],
  knownVolSamples: [],
  knownMktSamples: [],
};

describe('切り詰め不変性', () => {
  const cases: { market: Market; date: string }[] = [];
  for (const market of ['JP', 'US'] as const) {
    for (const date of calendar[market]) {
      cases.push({ market, date });
    }
  }

  it.each(cases)('$market $date: 全期間と切り詰め後で出力が完全一致する', ({ market, date }) => {
    const full = computeForDate(history, date, market, { now: 0 });
    const truncatedBars = truncate(allBars, date, market);
    const truncatedHistory: ForecastHistory = { ...history, bars: truncatedBars };
    const truncated = computeForDate(truncatedHistory, date, market, { now: 0 });
    expect(truncated).toEqual(full);
  });
});
