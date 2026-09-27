/**
 * アクセス監視テスト（design.md §4）。
 *
 * history をラップし、予測時刻より後に確定するデータ（足・過去の予測）へアクセスしたら
 * 例外を投げるようにする。computeForDate をこの監視付き history で呼んでも例外が出ないことを
 * 確認する（将来データを一切参照していないことの証拠）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeForDate } from '../../../src/forecast/compute.js';
import { getMarketForExchange, nominalCloseTime } from '../../../src/forecast/time.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';
import type {
  DailyBarInput,
  ForecastHistory,
  KnownProbabilitySample,
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

const RESTRICTED_BAR_KEYS = new Set(['open', 'high', 'low', 'close', 'volume', 'patternResults']);
const RESTRICTED_SAMPLE_KEYS = new Set(['probability', 'baseline', 'hit']);

class FutureAccessError extends Error {}

/** cutoff より後に確定するバーの値フィールドへアクセスしたら例外を投げるプロキシを作る */
function guardBars(bars: readonly DailyBarInput[], cutoff: number): DailyBarInput[] {
  return bars.map((bar) => {
    const confirmedAt = nominalCloseTime(bar.date, getMarketForExchange(bar.exchangeId));
    return new Proxy(bar, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && RESTRICTED_BAR_KEYS.has(prop) && confirmedAt > cutoff) {
          throw new FutureAccessError(
            `未確定のバー(${target.tickerId} ${target.date})の ${prop} にアクセスした`
          );
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  });
}

/** cutoff より後に確定する既知の予測（採点結果）へアクセスしたら例外を投げるプロキシを作る */
function guardKnownSamples(
  samples: readonly KnownProbabilitySample[],
  calendar: Record<Market, readonly string[]>,
  cutoff: number
): KnownProbabilitySample[] {
  return samples.map((sample) => {
    const nextIndex = calendar[sample.market].indexOf(sample.date) + 1;
    const nextDate = calendar[sample.market][nextIndex];
    const confirmedAt =
      nextDate !== undefined ? nominalCloseTime(nextDate, sample.market) : Infinity;
    return new Proxy(sample, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && RESTRICTED_SAMPLE_KEYS.has(prop) && confirmedAt > cutoff) {
          throw new FutureAccessError(
            `未確定の予測(${target.market} ${target.date})の ${prop} にアクセスした`
          );
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  });
}

describe('アクセス監視', () => {
  const targetDate = '2024-04-19';
  const targetMarket: Market = 'JP';
  const cutoff = nominalCloseTime(targetDate, targetMarket);

  // 観測カレンダー（ガード対象の判定に使う。これ自体は computeForDate の外で用意する）
  const calendarDates: Record<Market, string[]> = { JP: [], US: [] };
  for (const bar of allBars) {
    const m = getMarketForExchange(bar.exchangeId);
    if (!calendarDates[m].includes(bar.date)) calendarDates[m].push(bar.date);
  }
  calendarDates.JP.sort();
  calendarDates.US.sort();

  it('computeForDate は未確定のバー・既知予測へアクセスしない', () => {
    const guardedBars = guardBars(allBars, cutoff);
    // 過去1件・未来1件（ダミー）の既知サンプルを混ぜて監視する
    const rawKnownSamples: KnownProbabilitySample[] = [
      { market: 'JP', date: '2024-02-01', probability: 0.5, baseline: 0.5, hit: true },
      { market: 'US', date: '2024-04-18', probability: 0.5, baseline: 0.5, hit: false },
    ];
    const guardedKnown = guardKnownSamples(rawKnownSamples, calendarDates, cutoff);

    const history: ForecastHistory = {
      bars: guardedBars,
      knownDirSamples: guardedKnown,
      knownVolSamples: guardedKnown,
      knownMktSamples: guardedKnown,
    };

    expect(() => computeForDate(history, targetDate, targetMarket, { now: 0 })).not.toThrow();
  });

  it('ガード自体は未確定データへのアクセスで例外を投げる（ガードの正しさの確認）', () => {
    const guardedBars = guardBars(allBars, cutoff);
    const futureBar = guardedBars.find(
      (b) => getMarketForExchange(b.exchangeId) === 'US' && nominalCloseTime(b.date, 'US') > cutoff
    )!;
    expect(futureBar).toBeDefined();
    expect(() => futureBar.close).toThrow(FutureAccessError);
    // 許可されたフィールド（date 等）は例外を投げない
    expect(() => futureBar.date).not.toThrow();
  });
});
