/**
 * Stock Tracker Core - Forecast 算出の中核（design.md §1・§2.3・§4）
 *
 * `computeForDate` が中核の入口。DB アクセスは行わない純粋関数（NFR-4）。
 */
import {
  AXIS_ID_MARKET_PARKINSON_5D,
  AXIS_ID_MARKET_RANGE_AVG,
  AXIS_ID_MARKET_RANGE_TODAY,
  AXIS_ID_MARKET_VOLUME_RATIO,
  AXIS_ID_PARKINSON_5D,
  AXIS_ID_RANGE_TODAY,
  AXIS_ID_VOLUME_RATIO,
  getAxisIdsForQuestion,
} from './axes.js';
import { baselineOffset, clipBaseline, computeRollingBaseline } from './baseline.js';
import {
  FORECAST_MODEL_VERSION,
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
  type NeutralBandHistoryPoint,
} from './neutral-band.js';
import {
  fitQuestionModel,
  hasEnoughTrainingData,
  predictProbability,
  standardizeForPrediction,
  type FittedQuestionModel,
  type TrainingRow,
} from './model.js';
import { buildPanel, type MarketDaySample, type TickerDaySample } from './preprocessing.js';
import {
  getMarketForExchange,
  getNextCalendarDate,
  isSampleUsable,
  nominalCloseTime,
} from './time.js';
import { logit } from './stats.js';
import type {
  AxisId,
  ComputeForDateResult,
  ComputeOutcomesResult,
  DailyBarInput,
  ForecastHistory,
  KnownProbabilitySample,
  MarketForecastResult,
  MarketOutcome,
  ModelSnapshotItem,
  ProbabilityRecord,
  TickerForecastResult,
  TickerOutcome,
} from './types.js';

/** 銘柄×日のサンプルから軸の値を取り出す */
function getTickerAxisValue(sample: TickerDaySample, axisId: AxisId): number | undefined {
  switch (axisId) {
    case AXIS_ID_PARKINSON_5D:
      return sample.parkinson5d;
    case AXIS_ID_RANGE_TODAY:
      return sample.rangeToday;
    case AXIS_ID_VOLUME_RATIO:
      return sample.volumeRatio;
    case AXIS_ID_MARKET_PARKINSON_5D:
      return sample.marketParkinson5d;
    case AXIS_ID_MARKET_RANGE_TODAY:
      return sample.marketRangeToday;
    case AXIS_ID_MARKET_VOLUME_RATIO:
      return sample.marketVolumeRatio;
    default:
      return sample.flags[axisId];
  }
}

/** 市場×日のサンプルから軸の値を取り出す */
function getMarketAxisValue(sample: MarketDaySample, axisId: AxisId): number | undefined {
  switch (axisId) {
    case AXIS_ID_MARKET_PARKINSON_5D:
      return sample.marketParkinson5d;
    case AXIS_ID_MARKET_RANGE_TODAY:
      return sample.marketRangeToday;
    case AXIS_ID_MARKET_VOLUME_RATIO:
      return sample.marketVolumeRatio;
    case AXIS_ID_MARKET_RANGE_AVG:
      return sample.marketRangeAvg;
    default:
      return undefined;
  }
}

function pickTickerAxisValues(
  axisIds: readonly AxisId[],
  sample: TickerDaySample
): Partial<Record<AxisId, number>> {
  const values: Partial<Record<AxisId, number>> = {};
  for (const axisId of axisIds) {
    const v = getTickerAxisValue(sample, axisId);
    if (v !== undefined) values[axisId] = v;
  }
  return values;
}

function pickMarketAxisValues(
  axisIds: readonly AxisId[],
  sample: MarketDaySample
): Partial<Record<AxisId, number>> {
  const values: Partial<Record<AxisId, number>> = {};
  for (const axisId of axisIds) {
    const v = getMarketAxisValue(sample, axisId);
    if (v !== undefined) values[axisId] = v;
  }
  return values;
}

/** 既知の予測サンプルを、時刻の規則で「今すでに知り得るもの」だけに絞り込む */
function filterKnownSamples(
  samples: readonly KnownProbabilitySample[],
  calendar: Record<Market, readonly string[]>,
  date: string,
  market: Market
): NeutralBandHistoryPoint[] {
  const result: NeutralBandHistoryPoint[] = [];
  for (const sample of samples) {
    const nextDate = getNextCalendarDate(calendar[sample.market], sample.date);
    if (nextDate === undefined) continue;
    if (!isSampleUsable(nextDate, sample.market, date, market)) continue;
    result.push({
      d: sample.probability - sample.baseline,
      y: sample.hit ? 1 : 0,
      base: sample.baseline,
    });
  }
  return result;
}

export interface ComputeForDateOptions {
  /** ModelSnapshot.CreatedAt に使う時刻 (Unix timestamp ms)。省略時は Date.now()（再現性テストでは固定値を渡す） */
  now?: number;
}

/**
 * 中核の入口（design.md §4）。
 *
 * history（全市場の DailySummary 相当と、既知の過去の予測）から、市場 market・日付 date の
 * 各銘柄の軸の値と確率（DIR・VOL）、市場の軸の値と確率（MKT）、問いごとのスナップショットを返す。
 */
export function computeForDate(
  history: ForecastHistory,
  date: string,
  market: Market,
  options: ComputeForDateOptions = {}
): ComputeForDateResult {
  const now = options.now ?? Date.now();
  // 予測時刻より後に確定するバー（NFR-4）は、前処理より前に落とす。切り詰め不変性テストが
  // 保証するとおり最終出力は変わらないが、未確定データへ一切アクセスしないことをここで担保する。
  const cutoff = nominalCloseTime(date, market);
  const visibleBars = history.bars.filter(
    (bar) => nominalCloseTime(bar.date, getMarketForExchange(bar.exchangeId)) <= cutoff
  );
  const panel = buildPanel(visibleBars);
  const calendar = panel.calendar;

  const dirAxisIds = getAxisIdsForQuestion('DIR');
  const volAxisIds = getAxisIdsForQuestion('VOL');
  const mktAxisIds = getAxisIdsForQuestion('MKT');

  // ---- 基準値（問いごと。pooled = JP・US 合算）
  const dirBaseline = computeRollingBaseline({
    calendar,
    samples: panel.tickerSamples
      .filter((s) => s.yDir !== undefined)
      .map((s) => ({ market: s.market, date: s.date, labelTime: s.labelTime!, y: s.yDir! })),
    predTimeOf: nominalCloseTime,
  });
  const volBaseline = computeRollingBaseline({
    calendar,
    samples: panel.tickerSamples
      .filter((s) => s.yVol !== undefined)
      .map((s) => ({ market: s.market, date: s.date, labelTime: s.labelTime!, y: s.yVol! })),
    predTimeOf: nominalCloseTime,
  });
  const mktBaseline = computeRollingBaseline({
    calendar,
    samples: panel.marketSamples
      .filter((s) => s.yMkt !== undefined)
      .map((s) => ({ market: s.market, date: s.date, labelTime: s.labelTime!, y: s.yMkt! })),
    predTimeOf: nominalCloseTime,
  });

  // ---- 学習サンプル（時刻の規則でフィルタ。design.md §1.4）
  const dirTrainingRows: TrainingRow[] = [];
  const volTrainingRows: TrainingRow[] = [];
  for (const sample of panel.tickerSamples) {
    if (!sample.nextOk || sample.nextDate === undefined) continue;
    if (!isSampleUsable(sample.nextDate, sample.market, date, market)) continue;
    if (sample.yDir !== undefined) {
      dirTrainingRows.push({
        values: pickTickerAxisValues(dirAxisIds, sample),
        y: sample.yDir,
        offset: baselineOffset(dirBaseline[sample.market][sample.date]),
        date: sample.date,
        excessReturn: sample.excessReturn,
      });
    }
    if (sample.yVol !== undefined) {
      volTrainingRows.push({
        values: pickTickerAxisValues(volAxisIds, sample),
        y: sample.yVol,
        offset: baselineOffset(volBaseline[sample.market][sample.date]),
        date: sample.date,
      });
    }
  }

  const mktTrainingRows: TrainingRow[] = [];
  for (const sample of panel.marketSamples) {
    if (!sample.nextOk || sample.nextDate === undefined) continue;
    if (!isSampleUsable(sample.nextDate, sample.market, date, market)) continue;
    if (sample.yMkt !== undefined) {
      mktTrainingRows.push({
        values: pickMarketAxisValues(mktAxisIds, sample),
        y: sample.yMkt,
        offset: baselineOffset(mktBaseline[sample.market][sample.date]),
        date: sample.date,
      });
    }
  }

  const dirModel = fitQuestionModel('DIR', dirAxisIds, dirTrainingRows);
  const volModel = fitQuestionModel('VOL', volAxisIds, volTrainingRows);
  const mktModel = fitQuestionModel('MKT', mktAxisIds, mktTrainingRows);

  const dirBurnInOk = hasEnoughTrainingData(dirModel);
  const volBurnInOk = hasEnoughTrainingData(volModel);
  const mktBurnInOk = hasEnoughTrainingData(mktModel);

  const dirBaselineValue = clipBaseline(dirBaseline[market][date]);
  const volBaselineValue = clipBaseline(volBaseline[market][date]);
  const mktBaselineValue = clipBaseline(mktBaseline[market][date]);

  // ---- 中立帯（見直しの規則。design.md §1.5）
  const dirKnownHist = filterKnownSamples(history.knownDirSamples, calendar, date, market);
  const volKnownHist = filterKnownSamples(history.knownVolSamples, calendar, date, market);
  const mktKnownHist = filterKnownSamples(history.knownMktSamples, calendar, date, market);

  const dirNeutralBand = resolveNeutralBandState({
    question: 'DIR',
    date,
    market,
    calendar: calendar[market],
    previous: history.previousNeutralBands?.DIR,
    hist: dirKnownHist,
  });
  const volNeutralBand = resolveNeutralBandState({
    question: 'VOL',
    date,
    market,
    calendar: calendar[market],
    previous: history.previousNeutralBands?.VOL,
    hist: volKnownHist,
  });
  const mktNeutralBand = resolveNeutralBandState({
    question: 'MKT',
    date,
    market,
    calendar: calendar[market],
    previous: history.previousNeutralBands?.MKT,
    hist: mktKnownHist,
  });

  const dirBandHistoryTable = computeBandHistoryTable(
    dirKnownHist.map((h) => ({ probability: h.d + h.base, hit: h.y })),
    PROBABILITY_BAND_STEP
  );
  const volBandHistoryTable = computeBandHistoryTable(
    volKnownHist.map((h) => ({ probability: h.d + h.base, hit: h.y })),
    PROBABILITY_BAND_STEP
  );
  const mktBandHistoryTable = computeBandHistoryTable(
    mktKnownHist.map((h) => ({ probability: h.d + h.base, hit: h.y })),
    PROBABILITY_BAND_STEP
  );

  const dirLowSampleAxes = lowSampleAxesOf(dirModel);
  const volLowSampleAxes = lowSampleAxesOf(volModel);
  const mktLowSampleAxes = lowSampleAxesOf(mktModel);

  // ---- 銘柄×日: 軸の値・確率
  const tickers: TickerForecastResult[] = [];
  for (const sample of panel.tickerSamples) {
    if (sample.market !== market || sample.date !== date) continue;

    const axisValues: Partial<Record<AxisId, number | boolean>> = {};
    for (const axisId of dirAxisIds) {
      axisValues[axisId] = sample.flags[axisId] === 1;
    }
    for (const axisId of volAxisIds) {
      const v = getTickerAxisValue(sample, axisId);
      if (v !== undefined) axisValues[axisId] = v;
    }

    const probabilities: TickerForecastResult['probabilities'] = {};

    if (dirBurnInOk) {
      probabilities.DIR = buildProbabilityRecord({
        question: 'DIR',
        model: dirModel,
        values: pickTickerAxisValues(dirAxisIds, sample),
        baseline: dirBaselineValue,
        neutralBand: dirNeutralBand,
        bandHistoryTable: dirBandHistoryTable,
        lowSampleAxes: dirLowSampleAxes,
      });
    }
    if (volBurnInOk && sample.normalRange !== undefined) {
      probabilities.VOL = buildProbabilityRecord({
        question: 'VOL',
        model: volModel,
        values: pickTickerAxisValues(volAxisIds, sample),
        baseline: volBaselineValue,
        neutralBand: volNeutralBand,
        bandHistoryTable: volBandHistoryTable,
        lowSampleAxes: volLowSampleAxes,
      });
    }

    tickers.push({
      tickerId: sample.tickerId,
      exchangeId: sample.exchangeId,
      market: sample.market,
      date: sample.date,
      axisValues,
      normal: { range: sample.normalRange, volume: sample.normalVolume },
      probabilities,
    });
  }

  // ---- 市場×日: 軸の値・確率
  const marketSample = panel.marketSamples.find((s) => s.market === market && s.date === date);
  const marketAxisValues: Partial<Record<AxisId, number>> = marketSample
    ? pickMarketAxisValues(mktAxisIds, marketSample)
    : {};
  const marketProbabilities: MarketForecastResult['probabilities'] = {};
  if (mktBurnInOk && marketSample) {
    marketProbabilities.MKT = buildProbabilityRecord({
      question: 'MKT',
      model: mktModel,
      values: pickMarketAxisValues(mktAxisIds, marketSample),
      baseline: mktBaselineValue,
      neutralBand: mktNeutralBand,
      bandHistoryTable: mktBandHistoryTable,
      lowSampleAxes: mktLowSampleAxes,
    });
  }

  const marketForecast: MarketForecastResult = {
    market,
    date,
    axisValues: marketAxisValues,
    probabilities: marketProbabilities,
  };

  const modelSnapshots: ComputeForDateResult['modelSnapshots'] = {
    DIR: buildModelSnapshot(
      'DIR',
      market,
      date,
      dirModel,
      dirBaselineValue,
      dirNeutralBand,
      dirBandHistoryTable,
      now
    ),
    VOL: buildModelSnapshot(
      'VOL',
      market,
      date,
      volModel,
      volBaselineValue,
      volNeutralBand,
      volBandHistoryTable,
      now
    ),
    MKT: buildModelSnapshot(
      'MKT',
      market,
      date,
      mktModel,
      mktBaselineValue,
      mktNeutralBand,
      mktBandHistoryTable,
      now
    ),
  };

  return { date, market, tickers, marketForecast, modelSnapshots };
}

function lowSampleAxesOf(model: FittedQuestionModel): AxisId[] {
  return model.axisIds.filter((axisId) => model.axisStats[axisId]?.lowSample === true);
}

function buildModelSnapshot(
  question: Question,
  market: Market,
  date: string,
  model: FittedQuestionModel,
  baseline: number,
  neutralBand: ModelSnapshotItem['neutralBand'],
  bandHistory: ModelSnapshotItem['bandHistory'],
  createdAt: number
): ModelSnapshotItem {
  return {
    question,
    market,
    date,
    modelVersion: FORECAST_MODEL_VERSION,
    alpha: REGULARIZATION_ALPHA[question],
    weights: model.weights,
    standardization: model.standardization,
    baseline,
    neutralBand,
    bandHistory,
    axisStats: model.axisStats,
    trainingSize: model.trainingSize,
    createdAt,
  };
}

function buildProbabilityRecord(params: {
  question: Question;
  model: FittedQuestionModel;
  values: Partial<Record<AxisId, number>>;
  baseline: number;
  neutralBand: { lower: number; upper: number; decidedOn: string };
  bandHistoryTable: ModelSnapshotItem['bandHistory'];
  lowSampleAxes: AxisId[];
}): ProbabilityRecord {
  const { question, model, values, baseline, neutralBand, bandHistoryTable, lowSampleAxes } =
    params;
  const offsetLogit = logit(baseline);
  const standardized = standardizeForPrediction(model, values);
  const probability = predictProbability(model, offsetLogit, standardized);
  const contributions = computeSequentialContributions(
    offsetLogit,
    model.axisIds.map((axisId) => ({
      axisId,
      weight: model.weights[axisId] ?? 0,
      standardizedValue: standardized[axisId] ?? 0,
    }))
  );
  const d = probability - baseline;
  const lean = determineLean(question, d, neutralBand);
  const bandHistory = findBandHistoryEntry(bandHistoryTable, probability, PROBABILITY_BAND_STEP);

  return {
    probability,
    baseline,
    neutralBand: { lower: neutralBand.lower, upper: neutralBand.upper },
    bandHistory,
    lean,
    contributions,
    lowSampleAxes,
  };
}

/**
 * 実績（採点）の算出（design.md §1・§2.3。純粋関数として export する。design.md 点13）。
 *
 * bars（全期間分でよい）から、翌営業日のレコードが揃っている行すべてについて採点結果を返す。
 * どの日付の Outcome を実際に永続化するかは呼び出し側（バッチ）が決める。
 */
export function computeOutcomes(
  bars: readonly DailyBarInput[],
  evaluatedAt: number
): ComputeOutcomesResult {
  const panel = buildPanel(bars);

  const tickerOutcomes: TickerOutcome[] = [];
  for (const sample of panel.tickerSamples) {
    if (!sample.nextOk || sample.nextDate === undefined || sample.outcomeRaw === undefined)
      continue;
    const { nextReturn, nextRawRange, excludedExtremeReturn } = sample.outcomeRaw;
    const outcome: TickerOutcome = {
      tickerId: sample.tickerId,
      exchangeId: sample.exchangeId,
      market: sample.market,
      date: sample.date,
      nextDate: sample.nextDate,
      nextReturn,
      nextRange: nextRawRange,
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
        const rangeRatio = nextRawRange / sample.close / sample.normalRange;
        outcome.rangeRatio = rangeRatio;
        outcome.hit.VOL = rangeRatio > 1;
      }
    }
    tickerOutcomes.push(outcome);
  }

  const marketOutcomes: MarketOutcome[] = [];
  for (const sample of panel.marketSamples) {
    if (!sample.nextOk || sample.nextDate === undefined || sample.outcomeRaw === undefined)
      continue;
    const { nextMeanRawRange } = sample.outcomeRaw;
    const outcome: MarketOutcome = {
      market: sample.market,
      date: sample.date,
      nextDate: sample.nextDate,
      nextRange: nextMeanRawRange,
      hit: {},
      evaluatedAt,
    };
    if (sample.normalMeanRange !== undefined) {
      const rangeRatio = nextMeanRawRange / sample.normalMeanRange;
      outcome.rangeRatio = rangeRatio;
      outcome.hit.MKT = rangeRatio > 1;
    }
    marketOutcomes.push(outcome);
  }

  return { tickerOutcomes, marketOutcomes };
}
