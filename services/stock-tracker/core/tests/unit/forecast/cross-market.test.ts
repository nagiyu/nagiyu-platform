/**
 * 市場をまたぐケース（design.md §4・§1.4 時刻の規則）。
 *
 * 「JP の D の予測に、US の D−1 の実績（US の D の引けで確定）が入らないこと」を、
 * 明示的なテストケースとして持つ。US の D のバーを大きく変えても JP の D の予測が変わらない
 * ことで検証する（US の D のバーは、US の D−1 の翌営業日レコードであり、そのラベルは
 * US の D の引けで確定するため、JP の D の予測には使えない）。
 *
 * 逆方向（指摘 C-5）: US の D の予測には JP の D の実績を使ってよい（JP の引けは同じ暦日の
 * より早い時刻のため）。DIR/VOL・Q-MKT はいずれも JP・US 共通のモデル（design.md §1.2）で
 * あり、市場そのものではなく時刻の規則だけで学習サンプルの採否が決まることを、この非対称性で
 * 確認する。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type { DailyBarInput, PatternResults } from '../../../src/forecast/index.js';
import { REAL_EXCHANGES, US_AFTER_HOURS_EXCHANGES } from './support/exchanges.js';

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

// フィクスチャの最終営業日（JP・US とも観測がある）
const TARGET_DATE = '2024-03-18';

function perturb(bars: DailyBarInput[], tickerId: string, date: string): DailyBarInput[] {
  return bars.map((bar) =>
    bar.tickerId === tickerId && bar.date === date
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
}

describe('市場をまたぐケース', () => {
  it('US の D のバーを大きく変えても JP の D の予測は変わらない（US の D は US の D の引けで確定するため）', () => {
    const baseline = computeForDate(allBars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 0 });
    const perturbed = perturb(allBars, 'UT1', TARGET_DATE);
    const perturbedResult = computeForDate(perturbed, TARGET_DATE, 'JP', REAL_EXCHANGES, {
      now: 0,
    });

    expect(perturbedResult).toEqual(baseline);
  });

  it('（対照）JP の過去のバーを大きく変えると JP の D の予測は変わる', () => {
    const baseline = computeForDate(allBars, TARGET_DATE, 'JP', REAL_EXCHANGES, { now: 0 });
    const perturbed = perturb(allBars, 'JT1', '2024-02-01');
    const perturbedResult = computeForDate(perturbed, TARGET_DATE, 'JP', REAL_EXCHANGES, {
      now: 0,
    });

    expect(perturbedResult).not.toEqual(baseline);
  });

  it('許容される向き（指摘 C-5）: US の D の予測には JP の D の実績を使ってよい', () => {
    const baseline = computeForDate(allBars, TARGET_DATE, 'US', REAL_EXCHANGES, { now: 0 });
    const perturbed = perturb(allBars, 'JT1', TARGET_DATE);
    const perturbedResult = computeForDate(perturbed, TARGET_DATE, 'US', REAL_EXCHANGES, {
      now: 0,
    });

    // JP の D の引け（15:30 JST）は US の D の引け（16:00 EST、同じ暦日のより遅い時刻）より早いため、
    // JP・US 共通のプールドモデル（design.md §1.2）の学習に JP の D の実績が使える。
    expect(perturbedResult).not.toEqual(baseline);
  });

  it('取引所マスタの設定（US の End）を変えても、時刻の規則の向きは変わらない（指摘: 時間外込み設定でも成立）', () => {
    // US の End を 20:00（時間外取引込み）にしても、JP の D は依然として US の D−1 までしか
    // 使えず、US の D は JP の D を使える、という向きそのものは変わらないことを確認する。
    const jpBaseline = computeForDate(allBars, TARGET_DATE, 'JP', US_AFTER_HOURS_EXCHANGES, {
      now: 0,
    });
    const jpPerturbed = computeForDate(
      perturb(allBars, 'UT1', TARGET_DATE),
      TARGET_DATE,
      'JP',
      US_AFTER_HOURS_EXCHANGES,
      { now: 0 }
    );
    expect(jpPerturbed).toEqual(jpBaseline);

    const usBaseline = computeForDate(allBars, TARGET_DATE, 'US', US_AFTER_HOURS_EXCHANGES, {
      now: 0,
    });
    const usPerturbed = computeForDate(
      perturb(allBars, 'JT1', TARGET_DATE),
      TARGET_DATE,
      'US',
      US_AFTER_HOURS_EXCHANGES,
      { now: 0 }
    );
    expect(usPerturbed).not.toEqual(usBaseline);
  });
});
