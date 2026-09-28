/**
 * Stock Tracker Core - Forecast 算出の中核（design.md §1・§2.3・§3.1・§4）
 *
 * design.md §3.1 のとおり、bars（生の DailySummary 相当）から計算するのは
 * 「D の軸の値」（{@link computeAxisValuesForDate}）と「実績」（{@link computeOutcomes} /
 * {@link computeOutcomeForDate}）だけにする。学習・基準値・標準化・中立帯・確率帯の実績・
 * AxisStats は、保存済みサンプル列（{@link SampleHistory}）から計算する
 * （{@link computeModelSnapshot}）。スナップショットと軸の値から確率を組み立てるのが
 * {@link computeProbabilityRecord}。
 *
 * 3-2 のバッチは、この 4 つを日付順に呼んでサンプルを積んでいけばよい。`computeForDate` は
 * bars だけからリプレイ相当で全部作る便宜の合成関数で、テストとゴールデン用。
 *
 * いずれも DB アクセスは行わない純粋関数（NFR-4）。
 */
import { getAxisIdsForQuestion } from './axes.js';
import { baselineOffset, clipBaseline, computeRollingBaseline } from './baseline.js';
import {
  FORECAST_MODEL_VERSION,
  MIN_TRAINING_DATES,
  PROBABILITY_BAND_STEP,
  REGULARIZATION_ALPHA,
  type Market,
  type Question,
} from './constants.js';
import { computeSequentialContributions } from './contributions.js';
import {
  determineLean,
  computeBandHistoryTable,
  findBandHistoryEntry,
  resolveNeutralBandState,
} from './neutral-band.js';
import {
  fitQuestionModel,
  predictProbability,
  standardizeForPrediction,
  type FittedQuestionModel,
} from './model.js';
import {
  axisValuesFromMarketSample,
  axisValuesFromTickerSample,
  computeAxisValuesForDate,
  buildPanel,
  partitionByKnownExchange,
  type MarketDaySample,
  type TickerDaySample,
} from './preprocessing.js';
import {
  buildSampleCalendar,
  buildUnionSampleCalendar,
  buildBaselineSamples,
  buildTrainingRows,
  collectKnownProbabilitySamples,
  ensureCalendarIncludes,
} from './sampling.js';
import { nominalMarketCloseTime, type ExchangeSessionInfo } from './time.js';
import { logit } from './stats.js';
import type {
  AxisId,
  ComputeForDateResult,
  ComputeOutcomesResult,
  DailyBarInput,
  MarketForecastResult,
  MarketOutcome,
  MarketSample,
  ModelSnapshotItem,
  NeutralBandState,
  ProbabilityRecord,
  SampleHistory,
  TickerForecastResult,
  TickerOutcome,
  TickerSample,
} from './types.js';

/** 銘柄×日のサンプル 1 行から採点結果を作る（採点できないときは undefined） */
function tickerOutcomeFromSample(
  sample: TickerDaySample,
  evaluatedAt: number
): TickerOutcome | undefined {
  if (!sample.nextOk || sample.nextDate === undefined || sample.outcomeRaw === undefined)
    return undefined;
  const { nextReturn, nextRawRange, excludedExtremeReturn } = sample.outcomeRaw;
  // 値幅の定義（design.md §1.1）に揃える: 翌営業日の値幅 ÷ 基準日終値（生の価格差ではない）
  const nextRange = nextRawRange / sample.close;
  const outcome: TickerOutcome = {
    tickerId: sample.tickerId,
    exchangeId: sample.exchangeId,
    market: sample.market,
    date: sample.date,
    nextDate: sample.nextDate,
    nextReturn,
    nextRange,
    hit: {},
    evaluatedAt,
  };
  if (excludedExtremeReturn) {
    outcome.excludedReason = 'EXTREME_RETURN';
  } else {
    outcome.excessReturn = sample.excessReturn;
    if (sample.excessReturn !== undefined) {
      outcome.hit.DIR = sample.excessReturn > 0;
    }
    if (sample.normalRange !== undefined) {
      const rangeRatio = nextRange / sample.normalRange;
      outcome.rangeRatio = rangeRatio;
      outcome.hit.VOL = rangeRatio > 1;
    }
  }
  return outcome;
}

/** 市場×日のサンプル 1 行から採点結果を作る（採点できないときは undefined） */
function marketOutcomeFromSample(
  sample: MarketDaySample,
  evaluatedAt: number
): MarketOutcome | undefined {
  if (!sample.nextOk || sample.nextDate === undefined || sample.outcomeRaw === undefined)
    return undefined;
  const { nextMeanRange } = sample.outcomeRaw;
  const outcome: MarketOutcome = {
    market: sample.market,
    date: sample.date,
    nextDate: sample.nextDate,
    nextRange: nextMeanRange,
    hit: {},
    evaluatedAt,
  };
  if (sample.normalMeanRange !== undefined) {
    const rangeRatio = nextMeanRange / sample.normalMeanRange;
    outcome.rangeRatio = rangeRatio;
    outcome.hit.MKT = rangeRatio > 1;
  }
  return outcome;
}

/**
 * 実績（採点）の算出（design.md §1・§3.1「D と翌営業日の足 → Outcome」。純粋関数として export する）。
 *
 * bars（全期間分でよい）から、翌営業日のレコードが揃っている行すべてについて採点結果を返す。
 * どの日付の Outcome を実際に永続化するかは呼び出し側（バッチ）が決める。
 */
export function computeOutcomes(
  bars: readonly DailyBarInput[],
  evaluatedAt: number,
  exchanges: readonly ExchangeSessionInfo[]
): ComputeOutcomesResult {
  const panel = buildPanel(bars, exchanges);
  const tickerOutcomes = panel.tickerSamples
    .map((sample) => tickerOutcomeFromSample(sample, evaluatedAt))
    .filter((o): o is TickerOutcome => o !== undefined);
  const marketOutcomes = panel.marketSamples
    .map((sample) => marketOutcomeFromSample(sample, evaluatedAt))
    .filter((o): o is MarketOutcome => o !== undefined);
  return { tickerOutcomes, marketOutcomes };
}

/**
 * 「D と翌営業日の足 → Outcome」を 1 市場・1 日に絞って返す薄いラッパー
 * （design.md §3.1。3-2 のバッチはこちらを日付ごとに呼べばよい）。
 */
export function computeOutcomeForDate(
  bars: readonly DailyBarInput[],
  date: string,
  market: Market,
  evaluatedAt: number,
  exchanges: readonly ExchangeSessionInfo[]
): { tickerOutcomes: TickerOutcome[]; marketOutcome: MarketOutcome | undefined } {
  const { tickerOutcomes, marketOutcomes } = computeOutcomes(bars, evaluatedAt, exchanges);
  return {
    tickerOutcomes: tickerOutcomes.filter((o) => o.market === market && o.date === date),
    marketOutcome: marketOutcomes.find((o) => o.market === market && o.date === date),
  };
}

export interface ComputeModelSnapshotOptions {
  /** 直前の中立帯（design.md §1.5 見直しの規則）。無ければ null または省略 */
  previousNeutralBand?: NeutralBandState | null;
  /** true なら見直し間隔によらず必ず中立帯を判定し直す（稼働開始日用） */
  forceNeutralBandRecompute?: boolean;
  /** ModelSnapshot.CreatedAt に使う時刻 (Unix timestamp ms)。省略時は Date.now() */
  now?: number;
}

/**
 * 保存済みサンプル列 + D → スナップショット（design.md §3.1）。
 *
 * 学習・基準値・標準化・中立帯・確率帯の実績・AxisStats を、`history`（保存済み
 * Forecast/MarketForecast 相当）から計算する。bars（生の DailySummary）には依存しない。
 */
export function computeModelSnapshot(
  question: Question,
  history: SampleHistory,
  date: string,
  market: Market,
  exchanges: readonly ExchangeSessionInfo[],
  options: ComputeModelSnapshotOptions = {}
): ModelSnapshotItem {
  const axisIds = getAxisIdsForQuestion(question);

  const perMarketCalendar = ensureCalendarIncludes(
    buildSampleCalendar(question, history),
    market,
    date
  );
  const baselineSamples = buildBaselineSamples(question, history, exchanges);
  const baselineByMarketDate = computeRollingBaseline({
    calendar: perMarketCalendar,
    samples: baselineSamples,
    predTimeOf: (d, m) => nominalMarketCloseTime(m, d, exchanges),
  });

  const trainingRows = buildTrainingRows(
    question,
    history,
    date,
    market,
    (sMarket, sDate) => baselineOffset(baselineByMarketDate[sMarket][sDate]),
    exchanges
  );
  const model = fitQuestionModel(question, axisIds, trainingRows);

  const baselineValue = clipBaseline(baselineByMarketDate[market][date]);

  const unionCalendar = buildUnionSampleCalendar(question, history);
  const knownHist = collectKnownProbabilitySamples(question, history, date, market, exchanges);
  const neutralBand = resolveNeutralBandState({
    question,
    date,
    calendar: unionCalendar.includes(date) ? unionCalendar : [...unionCalendar, date].sort(),
    previous: options.previousNeutralBand,
    hist: knownHist,
    forceRecompute: options.forceNeutralBandRecompute,
  });
  const bandHistory = computeBandHistoryTable(
    knownHist.map((h) => ({ probability: h.d + h.base, hit: h.y })),
    PROBABILITY_BAND_STEP
  );

  return {
    question,
    market,
    date,
    modelVersion: FORECAST_MODEL_VERSION,
    alpha: REGULARIZATION_ALPHA[question],
    weights: model.weights,
    standardization: model.standardization,
    baseline: baselineValue,
    neutralBand,
    bandHistory,
    axisStats: model.axisStats,
    trainingSize: model.trainingSize,
    distinctTrainingDates: model.distinctTrainingDates,
    createdAt: options.now ?? Date.now(),
  };
}

/** スナップショットのバーンイン判定（design.md §1.6）。学習サンプルの異なる日付が閾値未満なら false */
export function hasEnoughTrainingData(snapshot: ModelSnapshotItem): boolean {
  return snapshot.distinctTrainingDates >= MIN_TRAINING_DATES;
}

/**
 * スナップショット + D の軸の値 → ProbabilityRecord（design.md §3.1）。
 *
 * バーンイン判定（{@link hasEnoughTrainingData}）と、VOL の「平常が無い銘柄は出さない」判定は
 * 呼び出し側が行う（このスナップショットに閉じた判定ではないため）。
 */
export function computeProbabilityRecord(
  question: Question,
  snapshot: ModelSnapshotItem,
  axisValues: Partial<Record<AxisId, number | boolean>>
): ProbabilityRecord {
  const axisIds = getAxisIdsForQuestion(question);
  const numericValues: Partial<Record<AxisId, number>> = {};
  for (const axisId of axisIds) {
    const raw = axisValues[axisId];
    if (raw === undefined) continue;
    numericValues[axisId] = typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
  }

  const fittedModel: FittedQuestionModel = {
    axisIds,
    weights: snapshot.weights,
    standardization: snapshot.standardization,
    trainingSize: snapshot.trainingSize,
    distinctTrainingDates: snapshot.distinctTrainingDates,
    axisStats: snapshot.axisStats,
  };

  const offsetLogit = logit(snapshot.baseline);
  const standardized = standardizeForPrediction(fittedModel, numericValues);
  const probability = predictProbability(fittedModel, offsetLogit, standardized);
  const contributions = computeSequentialContributions(
    offsetLogit,
    axisIds.map((axisId) => ({
      axisId,
      weight: snapshot.weights[axisId] ?? 0,
      standardizedValue: standardized[axisId] ?? 0,
    }))
  );
  const d = probability - snapshot.baseline;
  const lean = determineLean(question, d, snapshot.neutralBand);
  const bandHistory = findBandHistoryEntry(
    snapshot.bandHistory,
    probability,
    PROBABILITY_BAND_STEP
  );
  const lowSampleAxes = axisIds.filter((axisId) => snapshot.axisStats[axisId]?.lowSample === true);

  return {
    probability,
    baseline: snapshot.baseline,
    neutralBand: { lower: snapshot.neutralBand.lower, upper: snapshot.neutralBand.upper },
    bandHistory,
    lean,
    contributions,
    lowSampleAxes,
  };
}

/** (market,date) でソートするための比較キー */
function sortKey(market: Market, date: string): string {
  return `${market}#${date}`;
}

/**
 * bars だけから、D までのサンプル履歴（{@link SampleHistory}）をリプレイで組み立てる。
 * テスト・ゴールデン・初期値算出（リプレイ）用の便宜関数（design.md §3.1・§3.3）。
 *
 * 名目引け時刻の順に (market, date) を 1 つずつ処理し、それぞれの時点で「それまでに
 * 積んだサンプルだけ」からスナップショットを計算して確率を出す。将来データは
 * 構造的に混ざらない。
 */
export function buildSampleHistoryThroughDate(
  bars: readonly DailyBarInput[],
  throughDate: string,
  throughMarket: Market,
  exchanges: readonly ExchangeSessionInfo[]
): { history: SampleHistory; neutralBands: Partial<Record<Question, NeutralBandState>> } {
  // パネルは 1 回だけ組み立てて使い回す（各行の rolling 計算はそれ自身より前の行にしか依存しない
  // ため、リプレイの各時点で bars から作り直しても同じ値になる。切り詰め不変性テストが保証する
  // とおりで、ここでは単に無駄な再計算を避けるための最適化）。
  const panel = buildPanel(bars, exchanges);
  const tickersByKey = new Map<string, TickerDaySample[]>();
  for (const sample of panel.tickerSamples) {
    const key = sortKey(sample.market, sample.date);
    const list = tickersByKey.get(key);
    if (list) list.push(sample);
    else tickersByKey.set(key, [sample]);
  }
  const marketByKey = new Map<string, MarketDaySample>();
  for (const sample of panel.marketSamples) {
    marketByKey.set(sortKey(sample.market, sample.date), sample);
  }

  // 市場コードの集合は panel.calendar に現れたもの（= 実際に観測がある市場）ぶんだけ動的に回す
  // （design.md §1.1「取引所マスタの市場属性で決める」。固定 JP/US ではない）。
  const calendarEntries: { market: Market; date: string }[] = [];
  for (const market of Object.keys(panel.calendar)) {
    for (const date of panel.calendar[market]) {
      calendarEntries.push({ market, date });
    }
  }
  calendarEntries.sort(
    (a, b) =>
      nominalMarketCloseTime(a.market, a.date, exchanges) -
      nominalMarketCloseTime(b.market, b.date, exchanges)
  );

  const cutoff = nominalMarketCloseTime(throughMarket, throughDate, exchanges);

  const tickerSamples: TickerSample[] = [];
  const marketSamples: MarketSample[] = [];
  const neutralBands: Partial<Record<Question, NeutralBandState>> = {};

  for (const entry of calendarEntries) {
    const entryCloseTime = nominalMarketCloseTime(entry.market, entry.date, exchanges);
    if (entryCloseTime > cutoff) break;
    if (entryCloseTime === cutoff && entry.market === throughMarket && entry.date === throughDate) {
      // 対象そのものは履歴に積まない（まだ「保存済み」ではないため）
      continue;
    }

    const key = sortKey(entry.market, entry.date);
    const tickerRows = tickersByKey.get(key) ?? [];
    const marketRow = marketByKey.get(key);
    if (tickerRows.length === 0 && marketRow === undefined) continue;

    const historySoFar: SampleHistory = { tickerSamples, marketSamples };
    const tickerAxisValues = tickerRows.map(axisValuesFromTickerSample);
    const marketAxisValues = marketRow ? axisValuesFromMarketSample(marketRow) : undefined;

    const snapshots: Partial<Record<Question, ModelSnapshotItem>> = {};
    for (const question of ['DIR', 'VOL', 'MKT'] as const) {
      if (question !== 'MKT' && tickerRows.length === 0) continue;
      if (question === 'MKT' && marketAxisValues === undefined) continue;
      snapshots[question] = computeModelSnapshot(
        question,
        historySoFar,
        entry.date,
        entry.market,
        exchanges,
        {
          previousNeutralBand: neutralBands[question] ?? null,
          now: entryCloseTime,
        }
      );
      neutralBands[question] = snapshots[question]!.neutralBand;
    }

    for (let i = 0; i < tickerRows.length; i++) {
      const tickerRow = tickerRows[i];
      const ticker = tickerAxisValues[i];
      const tickerOutcome = tickerOutcomeFromSample(tickerRow, entryCloseTime);
      const sample: TickerSample = {
        tickerId: ticker.tickerId,
        exchangeId: ticker.exchangeId,
        market: ticker.market,
        date: ticker.date,
        axisValues: ticker.axisValues,
        normal: ticker.normal,
      };
      if (tickerOutcome) {
        sample.outcome = {
          nextDate: tickerOutcome.nextDate,
          hit: tickerOutcome.hit,
          excessReturn: tickerOutcome.excessReturn,
          excludedReason: tickerOutcome.excludedReason,
        };
      }
      const probabilities: TickerSample['probabilities'] = {};
      const dirSnapshot = snapshots.DIR;
      const volSnapshot = snapshots.VOL;
      if (dirSnapshot && hasEnoughTrainingData(dirSnapshot)) {
        const record = computeProbabilityRecord('DIR', dirSnapshot, ticker.axisValues);
        probabilities.DIR = { probability: record.probability, baseline: record.baseline };
      }
      if (volSnapshot && hasEnoughTrainingData(volSnapshot) && ticker.normal.range !== undefined) {
        const record = computeProbabilityRecord('VOL', volSnapshot, ticker.axisValues);
        probabilities.VOL = { probability: record.probability, baseline: record.baseline };
      }
      if (Object.keys(probabilities).length > 0) {
        sample.probabilities = probabilities;
      }
      tickerSamples.push(sample);
    }

    if (marketRow && marketAxisValues) {
      const marketOutcome = marketOutcomeFromSample(marketRow, entryCloseTime);
      const sample: MarketSample = {
        market: marketAxisValues.market,
        date: marketAxisValues.date,
        axisValues: marketAxisValues.axisValues,
      };
      if (marketOutcome) {
        sample.outcome = { nextDate: marketOutcome.nextDate, hit: marketOutcome.hit };
      }
      const mktSnapshot = snapshots.MKT;
      if (mktSnapshot && hasEnoughTrainingData(mktSnapshot)) {
        const record = computeProbabilityRecord('MKT', mktSnapshot, marketAxisValues.axisValues);
        sample.probabilities = {
          MKT: { probability: record.probability, baseline: record.baseline },
        };
      }
      marketSamples.push(sample);
    }
  }

  return { history: { tickerSamples, marketSamples }, neutralBands };
}

/**
 * bars だけを渡すと、D までの履歴をリプレイで組み立てたうえで D の確度を返す便宜の合成関数
 * （design.md §3.1・§7 の「テストとゴールデン用」）。3-2 のバッチは、この内部と同じ 4 つの
 * 関数（{@link computeAxisValuesForDate}・{@link computeOutcomeForDate}・
 * {@link computeModelSnapshot}・{@link computeProbabilityRecord}）を、保存済みサンプルを
 * 積みながら個別に呼ぶ。
 */
export function computeForDate(
  bars: readonly DailyBarInput[],
  date: string,
  market: Market,
  exchanges: readonly ExchangeSessionInfo[],
  options: { now?: number } = {}
): ComputeForDateResult {
  const now = options.now ?? Date.now();
  const { skippedExchangeIds } = partitionByKnownExchange(bars, exchanges);
  const axisValues = computeAxisValuesForDate(bars, date, market, exchanges);

  if (axisValues.tickers.length === 0 && axisValues.market === undefined) {
    // design.md §1「D の足がその市場に 1 件も無いときは空の結果を返す」（NaN を出さない）
    return {
      date,
      market,
      tickers: [],
      marketForecast: undefined,
      modelSnapshots: {},
      skippedExchangeIds,
    };
  }

  const { history } = buildSampleHistoryThroughDate(bars, date, market, exchanges);

  const modelSnapshots: Partial<Record<Question, ModelSnapshotItem>> = {};
  for (const question of ['DIR', 'VOL', 'MKT'] as const) {
    modelSnapshots[question] = computeModelSnapshot(question, history, date, market, exchanges, {
      now,
    });
  }

  const dirSnapshot = modelSnapshots.DIR!;
  const volSnapshot = modelSnapshots.VOL!;
  const mktSnapshot = modelSnapshots.MKT!;
  const dirBurnInOk = hasEnoughTrainingData(dirSnapshot);
  const volBurnInOk = hasEnoughTrainingData(volSnapshot);
  const mktBurnInOk = hasEnoughTrainingData(mktSnapshot);

  const tickers: TickerForecastResult[] = axisValues.tickers.map((ticker) => {
    const probabilities: TickerForecastResult['probabilities'] = {};
    if (dirBurnInOk) {
      probabilities.DIR = computeProbabilityRecord('DIR', dirSnapshot, ticker.axisValues);
    }
    if (volBurnInOk && ticker.normal.range !== undefined) {
      probabilities.VOL = computeProbabilityRecord('VOL', volSnapshot, ticker.axisValues);
    }
    return { ...ticker, probabilities };
  });

  let marketForecast: MarketForecastResult | undefined;
  if (axisValues.market) {
    const probabilities: MarketForecastResult['probabilities'] = {};
    if (mktBurnInOk) {
      probabilities.MKT = computeProbabilityRecord(
        'MKT',
        mktSnapshot,
        axisValues.market.axisValues
      );
    }
    marketForecast = { ...axisValues.market, probabilities };
  }

  return { date, market, tickers, marketForecast, modelSnapshots, skippedExchangeIds };
}

// 参照実装との突き合わせ（golden test）やバッチ側の型付けのために、内部データ型も export する。
export type { TickerDaySample, MarketDaySample };
