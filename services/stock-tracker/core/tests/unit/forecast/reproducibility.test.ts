/**
 * 再現性テスト（NFR-3・design.md §4）。
 *
 * 同じ入力で 2 回実行し、完全一致することを確認する（乱数を使わない）。
 * design.md §3.1 の restructure 後は computeForDate/computeOutcomes とも bars を直接受け取る
 * （保存済みサンプルは内部でリプレイして組み立てる。ForecastHistory 相当の型は廃止済み）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate, computeOutcomes } from '../../../src/forecast/compute.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type { DailyBarInput, PatternResults } from '../../../src/forecast/index.js';
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

// フィクスチャの最終営業日（JP・US とも観測がある）
const TARGET_DATE = '2024-03-18';

describe('再現性', () => {
  it('computeForDate は同じ入力から同じ結果を返す（2 回実行して完全一致）', () => {
    const first = computeForDate(bars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 12345 });
    const second = computeForDate(bars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 12345 });
    expect(second).toEqual(first);
  });

  it('computeForDate は US 側でも再現する', () => {
    const first = computeForDate(bars, TARGET_DATE, 'US', REAL_EXCHANGES, { now: 12345 });
    const second = computeForDate(bars, TARGET_DATE, 'US', REAL_EXCHANGES, { now: 12345 });
    expect(second).toEqual(first);
  });

  it('computeOutcomes は同じ入力から同じ結果を返す', () => {
    const first = computeOutcomes(bars, 999, REAL_EXCHANGES);
    const second = computeOutcomes(bars, 999, REAL_EXCHANGES);
    expect(second).toEqual(first);
  });

  it('入力配列の並び順を変えても結果は完全一致する（指摘 D: (market, date, tickerId) で正準化）', () => {
    // buildPanel は ticker を tickerId 昇順に正準化してから集計するため、bars の入力順（Map の
    // 反復順）に依存する浮動小数点の加算順序は生まれない。NFR-3 の「同じ入力から同じ結果」を、
    // 入力の並び替えに対しても厳密一致で確認する。
    const shuffled = [...bars].reverse();
    const a = computeForDate(bars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 0 });
    const b = computeForDate(shuffled, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 0 });
    expect(b).toEqual(a);
  });

  it('取引所マスタの並び順を変えても結果は変わらない（入力の正準化。指摘 D）', () => {
    const reorderedExchanges = [...REAL_EXCHANGES].reverse();
    const a = computeForDate(bars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 0 });
    const b = computeForDate(bars, TARGET_DATE, 'JP', reorderedExchanges, { now: 0 });
    expect(b).toEqual(a);
  });
});
