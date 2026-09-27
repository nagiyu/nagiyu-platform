/**
 * 未来データ非漏洩テスト（design.md §4 の「時刻の規則」）。
 *
 * design.md §3.1 の restructure で、`buildSampleHistoryThroughDate` は bars からパネルを
 * 1 回だけ組み立てて使い回す（各行の rolling 計算はそれ自身より前の行にしか依存しないための
 * 最適化）。そのため「D より後に確定するバーの値フィールドに一切アクセスしない」という
 * フィールドアクセス単位のガード（Proxy で読み取りを検知する方式）は、この実装とは両立しない
 * （未来の行自身の派生値を計算する際に、その行自身の OHLC を読むこと自体は起こるため）。
 *
 * 代わりに、より直接的な「出力レベル」の非漏洩を確認する: D より後に確定するバーの値を
 * 破壊的な値（NaN 等）に書き換えても、D の予測結果（computeForDate の出力）が変わらないこと。
 * 実際に読まれて結果に影響するなら NaN が伝播して結果が変わるはずであり、変わらなければ
 * その値は D の予測に使われていない証拠になる。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
import { nominalExchangeTime, nominalMarketCloseTime } from '../../../src/forecast/time.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type { DailyBarInput, Market, PatternResults } from '../../../src/forecast/index.js';
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

const targetDate = '2024-03-18';
const targetMarket: Market = 'JP';

describe('未来データ非漏洩', () => {
  it('D より後に確定するバーの値を書き換えても、D の予測結果は変わらない', () => {
    const cutoff = nominalMarketCloseTime(targetMarket, targetDate, REAL_EXCHANGES);
    const poisoned: DailyBarInput[] = allBars.map((bar) => {
      const confirmedAt = nominalExchangeTime(bar.exchangeId, bar.date, 'close', REAL_EXCHANGES);
      if (confirmedAt <= cutoff) return bar;
      // D より後に確定するバー: 実際に読まれていれば結果が壊れる値に書き換える
      return {
        ...bar,
        open: Number.NaN,
        high: Number.NaN,
        low: Number.NaN,
        close: Number.NaN,
        volume: Number.NaN,
        patternResults: {},
      };
    });

    const baseline = computeForDate(allBars, targetDate, targetMarket, REAL_EXCHANGES, { now: 0 });
    const poisonedResult = computeForDate(poisoned, targetDate, targetMarket, REAL_EXCHANGES, {
      now: 0,
    });

    expect(poisonedResult).toEqual(baseline);
  });

  it('（ガードの前提の確認）D より後に確定するバーが実際に存在する', () => {
    const cutoff = nominalMarketCloseTime(targetMarket, targetDate, REAL_EXCHANGES);
    const future = allBars.find(
      (bar) => nominalExchangeTime(bar.exchangeId, bar.date, 'close', REAL_EXCHANGES) > cutoff
    );
    expect(future).toBeDefined();
  });
});
