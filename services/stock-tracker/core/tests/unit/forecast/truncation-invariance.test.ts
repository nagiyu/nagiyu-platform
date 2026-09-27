/**
 * 切り詰め不変性テスト（design.md §4・指摘 C-1）。
 *
 * 以前の版は「bars を computeForDate 内部と同じ述語で外部から切り詰めてから渡す」形だったため、
 * computeForDate 自身が内部で行っているフィルタと同じ述語を外側でもう一度適用しているだけの
 * 同語反復になっていた（それが正しく実装されていることは何も保証しない）。
 *
 * この版は SampleHistory のレベルで検証する: `buildSampleHistoryThroughDate` で作った
 * 「D より後のサンプル（採点結果・その時点の確率を含む）まで積んだ、切り詰めていない履歴」を
 * そのまま `computeModelSnapshot` に渡しても、正しく切り詰めた履歴を渡したときと完全に同じ
 * 結果になることを確認する。サンプルの採否は `buildTrainingRows` / `collectKnownProbabilitySamples` /
 * `buildBaselineSamples` が各サンプル自身の `outcome.nextDate`（銘柄サンプルはさらに
 * `exchangeId`）から直接判定するため（S-2 の解消）、呼び出し側が渡す履歴に未来のサンプルが
 * 混ざっていても、それだけで結果を汚染しないはずである。この関数自身の切り詰めロジックを
 * 検証する、外側の述語に依存しないテストになっている。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSampleHistoryThroughDate,
  computeModelSnapshot,
  computeProbabilityRecord,
  hasEnoughTrainingData,
} from '../../../src/forecast/compute.js';
import {
  buildObservationCalendar,
  computeAxisValuesForDate,
} from '../../../src/forecast/preprocessing.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type {
  DailyBarInput,
  Market,
  PatternResults,
  Question,
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

const calendar = buildObservationCalendar(allBars, REAL_EXCHANGES);
const LAST_DATE = calendar.JP[calendar.JP.length - 1];

// フィクスチャの最終日を US 側の throughDate として履歴を組み立てると、US の引け（同日でも JP より
// 遅い）が cutoff になるため、フィクスチャ中のほぼ全サンプル（= 個々のテスト対象日から見れば
// 「未来」のサンプルを多く含む）が積まれた、意図的に切り詰めていない履歴になる。
const { history: unfilteredHistory } = buildSampleHistoryThroughDate(
  allBars,
  LAST_DATE,
  'US',
  REAL_EXCHANGES
);

describe('切り詰め不変性（SampleHistory レベル）', () => {
  const cases: { market: Market; date: string }[] = [];
  for (const market of ['JP', 'US'] as const) {
    // 全日付だと組合せが多くなるため、burn-in を跨ぐよう疎に間引く（先頭・末尾・中間を含む）
    calendar[market].forEach((date, i) => {
      if (i % 7 === 0 || i === calendar[market].length - 1) {
        cases.push({ market, date });
      }
    });
  }

  it.each(cases)(
    '$market $date: 未来のサンプルを含む履歴を渡しても、正しく切り詰めた履歴と完全一致する',
    ({ market, date }) => {
      const { history: truncatedHistory } = buildSampleHistoryThroughDate(
        allBars,
        date,
        market,
        REAL_EXCHANGES
      );

      (['DIR', 'VOL', 'MKT'] as const).forEach((question: Question) => {
        const snapshotTruncated = computeModelSnapshot(
          question,
          truncatedHistory,
          date,
          market,
          REAL_EXCHANGES,
          {
            now: 0,
          }
        );
        const snapshotUnfiltered = computeModelSnapshot(
          question,
          unfilteredHistory,
          date,
          market,
          REAL_EXCHANGES,
          {
            now: 0,
          }
        );
        expect(snapshotUnfiltered).toEqual(snapshotTruncated);

        if (hasEnoughTrainingData(snapshotTruncated)) {
          const axisValues = computeAxisValuesForDate(allBars, date, market, REAL_EXCHANGES);
          const sampleAxisValues =
            question === 'MKT' ? axisValues.market?.axisValues : axisValues.tickers[0]?.axisValues;
          if (sampleAxisValues) {
            const recordTruncated = computeProbabilityRecord(
              question,
              snapshotTruncated,
              sampleAxisValues
            );
            const recordUnfiltered = computeProbabilityRecord(
              question,
              snapshotUnfiltered,
              sampleAxisValues
            );
            expect(recordUnfiltered).toEqual(recordTruncated);
          }
        }
      });
    }
  );
});
