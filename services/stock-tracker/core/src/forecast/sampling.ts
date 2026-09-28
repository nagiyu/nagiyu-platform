/**
 * Stock Tracker Core - 保存済みサンプルから学習・基準値・中立帯の入力を組み立てる。
 *
 * `SampleHistory`（TickerSample/MarketSample の履歴）だけを入力にする。DailyBarInput
 * （生の DailySummary）には依存しない。時刻の規則はサンプル自身が持つ `outcome.nextDate`
 * と `market`（銘柄サンプルはさらに `exchangeId`）から直接判定し、観測カレンダーは介さない
 * （渡されたサンプル集合の一部だけから観測カレンダーを作り直すと、欠けた日付を挟んで誤判定する
 * おそれがあるため）。市場コードの集合は固定 JP/US ではなく、呼び出し側が渡す取引所マスタ
 * （{@link ExchangeSessionInfo}）に現れるものを使う。
 */
import { getAxisIdsForQuestion } from './axes.js';
import type { Market, Question } from './constants.js';
import {
  isMarketSampleUsable,
  isTickerSampleUsable,
  nominalExchangeTime,
  nominalMarketCloseTime,
  type ExchangeSessionInfo,
} from './time.js';
import type { TrainingRow } from './model.js';
import type { NeutralBandHistoryPoint } from './neutral-band.js';
import type { BaselineKnownSample } from './baseline.js';
import type { AxisId, MarketSample, SampleHistory, TickerSample } from './types.js';

/** 点灯型（boolean）を含む軸の値を、学習・標準化で使う数値に変換する */
function axisValueAsNumber(value: number | boolean | undefined): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

/** 軸 ID の一覧に対応する値だけを取り出す（値が無い軸は notna().all に合わせて省く） */
function pickAxisValues(
  axisIds: readonly AxisId[],
  axisValues: Partial<Record<AxisId, number | boolean>>
): Partial<Record<AxisId, number>> {
  const values: Partial<Record<AxisId, number>> = {};
  for (const axisId of axisIds) {
    const v = axisValueAsNumber(axisValues[axisId]);
    if (v !== undefined) values[axisId] = v;
  }
  return values;
}

/**
 * (market, date) の一覧から、市場ごとのソート済みカレンダーを作る。
 * 市場コードの集合はサンプルに現れたものぶんだけ動的に持つ（固定 JP/US ではない）。
 */
export function buildCalendarFromEntries(
  entries: readonly { market: Market; date: string }[]
): Record<Market, string[]> {
  const sets = new Map<Market, Set<string>>();
  for (const entry of entries) {
    let set = sets.get(entry.market);
    if (set === undefined) {
      set = new Set();
      sets.set(entry.market, set);
    }
    set.add(entry.date);
  }
  const result: Record<Market, string[]> = {};
  for (const [market, set] of sets) {
    result[market] = [...set].sort();
  }
  return result;
}

/** (market, date) の一覧から、両市場を合わせたソート済みカレンダー（重複日付は 1 つ）を作る */
export function buildUnionCalendarFromEntries(
  entries: readonly { market: Market; date: string }[]
): string[] {
  const dates = new Set(entries.map((e) => e.date));
  return [...dates].sort();
}

/** 問いに対応するサンプル列（DIR・VOL は銘柄、MKT は市場）を選ぶ */
function samplesForQuestion(
  question: Question,
  history: SampleHistory
): readonly (TickerSample | MarketSample)[] {
  return question === 'MKT' ? history.marketSamples : history.tickerSamples;
}

/** 問いの学習・基準値に使う市場別カレンダー（そのサンプルがある日付の集合） */
export function buildSampleCalendar(
  question: Question,
  history: SampleHistory
): Record<Market, string[]> {
  return buildCalendarFromEntries(samplesForQuestion(question, history));
}

/** 中立帯の見直し間隔に使う、両市場を合わせたカレンダー */
export function buildUnionSampleCalendar(question: Question, history: SampleHistory): string[] {
  return buildUnionCalendarFromEntries(samplesForQuestion(question, history));
}

/**
 * カレンダーに date が無ければ挿入して返す（無ければそのまま）。
 * 予測対象日がまだサンプルとして 1 件も無い場合でも、基準値の算出が NaN にならないようにする
 * 防御的な措置。
 */
export function ensureCalendarIncludes(
  calendar: Record<Market, readonly string[]>,
  market: Market,
  date: string
): Record<Market, string[]> {
  const existing = calendar[market] ?? [];
  const copy: Record<Market, string[]> = {};
  for (const m of Object.keys(calendar)) {
    copy[m] = [...calendar[m]];
  }
  if (existing.includes(date)) {
    if (copy[market] === undefined) copy[market] = [];
    return copy;
  }
  copy[market] = [...existing, date].sort();
  return copy;
}

/** 問いの目的変数（y）をサンプルから取り出す。未採点・対象外なら undefined */
function outcomeY(question: Question, sample: TickerSample | MarketSample): number | undefined {
  if (sample.outcome === undefined) return undefined;
  const hit = (sample.outcome.hit as Partial<Record<Question, boolean>>)[question];
  return hit === undefined ? undefined : hit ? 1 : 0;
}

/**
 * 基準値（rolling_base）の算出に使う、全市場合算の既知サンプルを作る。
 * オフセットは呼び出し側で `computeRollingBaseline` に渡して求める。
 */
export function buildBaselineSamples(
  question: Question,
  history: SampleHistory,
  exchanges: readonly ExchangeSessionInfo[]
): BaselineKnownSample[] {
  const samples = samplesForQuestion(question, history);
  const result: BaselineKnownSample[] = [];
  for (const sample of samples) {
    const y = outcomeY(question, sample);
    const outcome = sample.outcome;
    if (y === undefined || outcome === undefined) continue;
    result.push({
      market: sample.market,
      date: sample.date,
      labelTime: labelTimeOf(sample, outcome.nextDate, exchanges),
      y,
    });
  }
  return result;
}

/**
 * サンプルの翌営業日から名目引け時刻（= labelTime）を求める。
 * 銘柄サンプルはその取引所（`exchangeId`）の End、市場サンプルは市場の名目引け時刻を使う。
 */
function labelTimeOf(
  sample: TickerSample | MarketSample,
  nextDate: string,
  exchanges: readonly ExchangeSessionInfo[]
): number {
  return 'exchangeId' in sample
    ? nominalExchangeTime(sample.exchangeId, nextDate, 'close', exchanges)
    : nominalMarketCloseTime(sample.market, nextDate, exchanges);
}

/**
 * サンプルを、予測対象 (date, market) の予測に使ってよいかどうか。
 * 銘柄サンプルは `isTickerSampleUsable`（自身の取引所の End）、市場サンプルは
 * `isMarketSampleUsable`（サンプルの市場の名目引け時刻）で判定する。
 */
function sampleUsable(
  sample: TickerSample | MarketSample,
  nextDate: string,
  date: string,
  market: Market,
  exchanges: readonly ExchangeSessionInfo[]
): boolean {
  return 'exchangeId' in sample
    ? isTickerSampleUsable(nextDate, sample.exchangeId, date, market, exchanges)
    : isMarketSampleUsable(nextDate, sample.market, date, market, exchanges);
}

/**
 * 学習サンプルを、時刻の規則でフィルタして作る。
 * サンプル自身の `outcome.nextDate`（銘柄サンプルはさらに `exchangeId`）から時刻の規則を
 * 直接判定するため、観測カレンダーは使わない（渡されたサンプル集合の一部だけから観測
 * カレンダーを作り直すと、欠けた日付を挟んで誤判定するおそれがあるため）。
 */
export function buildTrainingRows(
  question: Question,
  history: SampleHistory,
  date: string,
  market: Market,
  offsetOf: (sampleMarket: Market, sampleDate: string) => number,
  exchanges: readonly ExchangeSessionInfo[]
): TrainingRow[] {
  const axisIds = getAxisIdsForQuestion(question);
  const samples = samplesForQuestion(question, history);
  const rows: TrainingRow[] = [];
  for (const sample of samples) {
    const outcome = sample.outcome;
    if (outcome === undefined) continue;
    if (!sampleUsable(sample, outcome.nextDate, date, market, exchanges)) continue;
    const y = outcomeY(question, sample);
    if (y === undefined) continue;
    const row: TrainingRow = {
      values: pickAxisValues(axisIds, sample.axisValues),
      y,
      offset: offsetOf(sample.market, sample.date),
      date: sample.date,
    };
    if (question === 'DIR' && 'excessReturn' in outcome) {
      row.excessReturn = outcome.excessReturn;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 中立帯の判定・確率帯の過去実績に使う、既知の（採点済みで確率も出している）予測を集める。
 * `outcome.nextDate` から直接時刻の規則を判定する（観測カレンダーに依存しない）。
 */
export function collectKnownProbabilitySamples(
  question: Question,
  history: SampleHistory,
  date: string,
  market: Market,
  exchanges: readonly ExchangeSessionInfo[]
): NeutralBandHistoryPoint[] {
  const samples = samplesForQuestion(question, history);
  const result: NeutralBandHistoryPoint[] = [];
  for (const sample of samples) {
    const outcome = sample.outcome;
    const probability = (
      sample.probabilities as
        | Partial<Record<Question, { probability: number; baseline: number }>>
        | undefined
    )?.[question];
    if (outcome === undefined || probability === undefined) continue;
    if (!sampleUsable(sample, outcome.nextDate, date, market, exchanges)) continue;
    const y = outcomeY(question, sample);
    if (y === undefined) continue;
    result.push({
      d: probability.probability - probability.baseline,
      y,
      base: probability.baseline,
    });
  }
  return result;
}
