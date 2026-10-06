/**
 * 確度算出バッチの Lambda Handler
 *
 * 通常モード: EventBridge から rate(1 hour) で起動されるほか、summary バッチの完了時に
 * 非同期起動される。市場ごとに、対象日 D（観測カレンダーの最新日でまだ確度が無い日）が
 * 揃った（または打ち切り時刻を過ぎた）ら、採点 → 重みの更新 → 確度の算出の3段を進める。
 *
 * リプレイモード（イベント `{ mode: 'replay', legacyExclusionBefore, from?, to?,
 * forceNeutralBandOn? }`）: 稼働開始時の初期値算出用。全期間の DailySummary を1回読み、
 * 日付を1日ずつ、市場をまたいで名目引け時刻の順に進めながら、通常モードと同じ3段を同じ関数
 * （{@link processMarketDate}）で呼ぶ。
 *
 * いずれのモードも各段の書き込みは冪等（条件付き作成・追記）なので、途中で落ちても
 * 次の実行で続きから進められる。1 つの市場・ステップの失敗は他を止めない。
 */

import { logger, toErrorMessage } from '@nagiyu/common';
import {
  EntityNotFoundError,
  getDynamoDBDocumentClient,
  getTableName,
  createScheduledHandler,
  reportErrorEvent,
  ScheduledHandlerError,
} from '@nagiyu/aws';
import type { HandlerResponse, ScheduledEvent } from '@nagiyu/aws';
import {
  DynamoDBDailySummaryRepository,
  DynamoDBExchangeRepository,
  DynamoDBForecastRepository,
  DynamoDBMarketForecastRepository,
  DynamoDBModelSnapshotRepository,
  DynamoDBPerformanceDailyRepository,
  FORECAST_MODEL_VERSION,
  QUESTIONS,
  buildObservationCalendar,
  computeAxisValuesForDate,
  computeModelSnapshot,
  computeOutcomeForDate,
  computePerformanceDaily,
  computeProbabilityRecord,
  distinctMarkets,
  excludeLegacyBackfillRows,
  hasEnoughTrainingData,
  nominalMarketCloseTime,
} from '@nagiyu/stock-tracker-core';
import type {
  DailyBarInput,
  DailySummaryForecastFields,
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
  ExchangeSessionInfo,
  ForecastRepository,
  Market,
  MarketForecastRepository,
  MarketOutcome,
  MarketSample,
  ModelSnapshotItem,
  ModelSnapshotRepository,
  NeutralBandState,
  PerformanceDailyRepository,
  ProbabilityRecord,
  Question,
  SampleHistory,
  TickerOutcome,
  TickerSample,
} from '@nagiyu/stock-tracker-core';
import { runConcurrent } from './lib/concurrent-queue.js';

/**
 * リプレイモードのイベント型。稼働開始時に過去の DailySummary から成績をさかのぼって
 * 作る初期値算出に使う。手動起動（`aws lambda invoke` 等）で渡す。
 */
export interface ReplayEvent {
  mode: 'replay';
  /**
   * この日付より前の DailySummary にだけ過去データ除外（休場日コピー足・途中足の除去）を
   * 適用する（YYYY-MM-DD）。それ以降は当時からこの除外が要らないデータになっているため、
   * 起動時に人が切り替え日を判断して渡す。
   */
  legacyExclusionBefore: string;
  /** リプレイ対象期間の開始日（省略時は観測カレンダーの最初から） */
  from?: string;
  /** リプレイ対象期間の終了日（省略時は観測カレンダーの最後まで。15分制限に収まらない場合の分割実行用） */
  to?: string;
  /** 中立帯を間隔によらず判定し直す日（省略時はリプレイ対象期間の最終日 = 稼働開始日） */
  forceNeutralBandOn?: string;
}

export type ForecastBatchEvent = ScheduledEvent | ReplayEvent;

/** 依存注入用 */
export interface HandlerDependencies {
  exchangeRepository: ExchangeRepository;
  dailySummaryRepository: DailySummaryRepository;
  forecastRepository: ForecastRepository;
  marketForecastRepository: MarketForecastRepository;
  modelSnapshotRepository: ModelSnapshotRepository;
  performanceDailyRepository: PerformanceDailyRepository;
  nowFn: () => number;
}

/** 通常モードの統計情報 */
export interface NormalBatchStatistics {
  /** 取引所マスタから決まる市場数 */
  totalMarkets: number;
  /** 新たに1日以上を処理した市場数 */
  processedMarkets: number;
  /** 新たに処理した日数の合計（市場をまたいで積算） */
  processedDates: number;
  /** リプレイ未実施のため何もしなかった市場数 */
  replayNotDone: number;
  /** 未処理の日が無く何もしなかった市場数 */
  alreadyUpToDate: number;
  /** 銘柄のサマリーがまだ揃っておらず待機した市場数 */
  waitingForData: number;
  /** その市場のサマリーが1件も無く何もしなかった市場数 */
  noMarketData: number;
  errors: number;
}

/** リプレイモードの統計情報 */
export interface ReplayBatchStatistics {
  /** 対象期間内の (市場, 日付) ステップ数 */
  totalSteps: number;
  /** 新たに処理したステップ数 */
  processedSteps: number;
  /** 既に確度算出済みでスキップしたステップ数 */
  alreadyDone: number;
  errors: number;
}

/** 打ち切りまでの猶予（名目引け時刻からの経過時間） */
const CUTOFF_MS_AFTER_CLOSE = 12 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 通常モードで DailySummary を読む窓（暦日）。
 *
 * 平常の算出窓（20営業日）・Parkinson窓（5営業日）に対し、軸の値の算出に要る
 * 直近レコードを確保できるよう、休場日を見込んだ余裕を持たせる。
 */
const NORMAL_MODE_LOOKBACK_DAYS = 60;

/**
 * 通常モードで1回の実行が処理する日数の上限。
 *
 * バッチが数時間〜数日止まっていた場合でも、未処理の日をまとめて処理しようとして
 * 1回の実行が長くなりすぎないよう、残りは次回の実行に回す。
 */
const MAX_DATES_PER_RUN = 10;

/**
 * 銘柄ごとの採点（Outcome 追記）・確度算出（Forecast 作成）を並列実行する上限。
 *
 * いずれも銘柄ごとに独立した条件付き書き込みであり、直列に await すると銘柄数（約120）×
 * 日数ぶんの往復時間がそのままリプレイの所要時間に乗ってしまう。上限を設けて並列化することで、
 * 初期値算出（リプレイ）が Lambda の15分制限に収まる見込みを確保する。
 */
const TICKER_WRITE_CONCURRENCY = 10;

/**
 * リプレイモードで DailySummary を読む範囲の番兵値。
 *
 * `DailySummaryRepository.getByExchangeAndDateRange` は fromDate/toDate が必須のため、
 * 「全期間」を表すのに実データがまず存在しない日付を使う。
 */
const REPLAY_EARLIEST_DATE = '2000-01-01';
const REPLAY_LATEST_DATE = '2100-01-01';

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD をその日の UTC 0時の Unix timestamp (ms) に変換する */
function ymdToMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isReplayEvent(event: ForecastBatchEvent): event is ReplayEvent {
  return (event as Partial<ReplayEvent>).mode === 'replay';
}

/** 取引所マスタから、市場が設定された取引所だけを {@link ExchangeSessionInfo} に変換する */
function toSessionInfos(exchanges: readonly ExchangeEntity[]): {
  known: ExchangeSessionInfo[];
  skippedExchangeIds: string[];
} {
  const known: ExchangeSessionInfo[] = [];
  const skippedExchangeIds: string[] = [];
  for (const exchange of exchanges) {
    if (exchange.Market === undefined) {
      skippedExchangeIds.push(exchange.ExchangeID);
      continue;
    }
    known.push({
      exchangeId: exchange.ExchangeID,
      market: exchange.Market,
      timezone: exchange.Timezone,
      start: exchange.Start,
      end: exchange.End,
    });
  }
  return { known, skippedExchangeIds };
}

function toDailyBarInput(summary: DailySummaryForecastFields): DailyBarInput {
  return {
    tickerId: summary.TickerID,
    exchangeId: summary.ExchangeID,
    date: summary.Date,
    open: summary.Open,
    high: summary.High,
    low: summary.Low,
    close: summary.Close,
    volume: summary.Volume,
    patternResults: summary.PatternResults,
    createdAt: summary.CreatedAt,
  };
}

function toTickerSampleOutcome(outcome: TickerOutcome): NonNullable<TickerSample['outcome']> {
  const sampleOutcome: NonNullable<TickerSample['outcome']> = {
    nextDate: outcome.nextDate,
    hit: outcome.hit,
  };
  if (outcome.excessReturn !== undefined) sampleOutcome.excessReturn = outcome.excessReturn;
  if (outcome.excludedReason !== undefined) sampleOutcome.excludedReason = outcome.excludedReason;
  return sampleOutcome;
}

function toMarketSampleOutcome(outcome: MarketOutcome): NonNullable<MarketSample['outcome']> {
  return { nextDate: outcome.nextDate, hit: outcome.hit };
}

function toTickerSampleProbabilities(
  probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>
): TickerSample['probabilities'] {
  const picked: NonNullable<TickerSample['probabilities']> = {};
  for (const question of ['DIR', 'VOL'] as const) {
    const record = probabilities[question];
    if (record !== undefined) {
      picked[question] = { probability: record.probability, baseline: record.baseline };
    }
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function toMarketSampleProbabilities(
  probabilities: Partial<Record<'MKT', ProbabilityRecord>>
): MarketSample['probabilities'] {
  const record = probabilities.MKT;
  return record !== undefined
    ? { MKT: { probability: record.probability, baseline: record.baseline } }
    : undefined;
}

/**
 * 段階2（重みの更新）・段階1（PerformanceDaily の再計算）が読む保存済みサンプルの取得先を
 * 抽象化したもの。
 *
 * 通常モードは毎回 DB から読む（DB 版）。リプレイモードは全期間を通しで処理するため、
 * 日ごとに DB を全件読み直すと読み出し量が日数分積み上がってしまう。そのためメモリ上に
 * 積んだサンプルを読み書きする版を使う。`on*` フックは、DB 版では何もしない
 * （DB 自体が唯一の記録のため）。
 */
interface SampleAccess {
  /** 段階2用: 全市場の学習サンプル */
  loadAllSamples(): Promise<SampleHistory>;
  /** 段階1用: 指定市場・日の採点済みサンプル（PerformanceDaily の入力） */
  loadSamplesForDate(
    market: Market,
    date: string
  ): Promise<{ tickers: TickerSample[]; markets: MarketSample[] }>;
  onTickerOutcomeAppended(tickerId: string, date: string, outcome: TickerOutcome): void;
  onMarketOutcomeAppended(market: Market, date: string, outcome: MarketOutcome): void;
  onTickerForecastCreated(sample: TickerSample): void;
  onMarketForecastCreated(sample: MarketSample): void;
}

function createDbSampleAccess(
  deps: HandlerDependencies,
  exchanges: readonly ExchangeSessionInfo[]
): SampleAccess {
  const allExchangeIds = exchanges.map((e) => e.exchangeId);
  const allMarkets = distinctMarkets(exchanges);
  return {
    async loadAllSamples() {
      const tickerSamples =
        await deps.forecastRepository.getSamplesByExchangesAndDateRange(allExchangeIds);
      const marketSamples: MarketSample[] = [];
      for (const market of allMarkets) {
        marketSamples.push(...(await deps.marketForecastRepository.getSamplesByDateRange(market)));
      }
      return { tickerSamples, marketSamples };
    },
    async loadSamplesForDate(market, date) {
      const marketExchangeIds = exchanges
        .filter((e) => e.market === market)
        .map((e) => e.exchangeId);
      const tickers = await deps.forecastRepository.getSamplesByExchangesAndDateRange(
        marketExchangeIds,
        date,
        date
      );
      const markets = await deps.marketForecastRepository.getSamplesByDateRange(market, date, date);
      return { tickers, markets };
    },
    onTickerOutcomeAppended: () => {},
    onMarketOutcomeAppended: () => {},
    onTickerForecastCreated: () => {},
    onMarketForecastCreated: () => {},
  };
}

/** リプレイモードがメモリ上に積み上げるサンプル置き場 */
interface ReplaySampleStore {
  tickerSamples: TickerSample[];
  marketSamples: MarketSample[];
  tickerIndex: Map<string, TickerSample>;
  marketIndex: Map<string, MarketSample>;
}

function createReplaySampleAccess(store: ReplaySampleStore): SampleAccess {
  return {
    async loadAllSamples() {
      return { tickerSamples: store.tickerSamples, marketSamples: store.marketSamples };
    },
    async loadSamplesForDate(market, date) {
      return {
        tickers: store.tickerSamples.filter((s) => s.market === market && s.date === date),
        markets: store.marketSamples.filter((s) => s.market === market && s.date === date),
      };
    },
    onTickerOutcomeAppended(tickerId, date, outcome) {
      const existing = store.tickerIndex.get(`${tickerId}#${date}`);
      if (existing) existing.outcome = toTickerSampleOutcome(outcome);
    },
    onMarketOutcomeAppended(market, date, outcome) {
      const existing = store.marketIndex.get(`${market}#${date}`);
      if (existing) existing.outcome = toMarketSampleOutcome(outcome);
    },
    onTickerForecastCreated(sample) {
      const key = `${sample.tickerId}#${sample.date}`;
      if (!store.tickerIndex.has(key)) {
        store.tickerSamples.push(sample);
        store.tickerIndex.set(key, sample);
      }
    },
    onMarketForecastCreated(sample) {
      const key = `${sample.market}#${sample.date}`;
      if (!store.marketIndex.has(key)) {
        store.marketSamples.push(sample);
        store.marketIndex.set(key, sample);
      }
    },
  };
}

async function seedReplaySampleStore(
  deps: HandlerDependencies,
  exchanges: readonly ExchangeSessionInfo[]
): Promise<ReplaySampleStore> {
  const allExchangeIds = exchanges.map((e) => e.exchangeId);
  const allMarkets = distinctMarkets(exchanges);
  const tickerSamples =
    await deps.forecastRepository.getSamplesByExchangesAndDateRange(allExchangeIds);
  const marketSamples: MarketSample[] = [];
  for (const market of allMarkets) {
    marketSamples.push(...(await deps.marketForecastRepository.getSamplesByDateRange(market)));
  }
  return {
    tickerSamples: [...tickerSamples],
    marketSamples: [...marketSamples],
    tickerIndex: new Map(tickerSamples.map((s) => [`${s.tickerId}#${s.date}`, s])),
    marketIndex: new Map(marketSamples.map((s) => [`${s.market}#${s.date}`, s])),
  };
}

/**
 * 問いごとに、市場をまたいで最も新しく判定された中立帯を引き継ぐ。
 *
 * 重みは市場共通のモデルであり、中立帯もモデルの一部のため、算出した市場ではなく
 * 実際の判定時刻（名目引け時刻）で最も新しいものを引き継ぐ（`targetPredTime` より前のものに限る）。
 * 市場ごとの ModelSnapshot は「算出した市場」ごとに分けて持つが、これはあくまで保存単位で
 * あり、モデル自体が市場ごとに別れているわけではない。
 */
async function getLatestNeutralBandAcrossMarkets(
  deps: HandlerDependencies,
  question: Question,
  markets: readonly Market[],
  exchanges: readonly ExchangeSessionInfo[],
  targetPredTime: number
): Promise<NeutralBandState | null> {
  let best: { predTime: number; band: NeutralBandState } | undefined;
  for (const market of markets) {
    const candidate = await deps.modelSnapshotRepository.getLatestBefore(
      question,
      market,
      REPLAY_LATEST_DATE
    );
    if (candidate === null) continue;
    const candidatePredTime = nominalMarketCloseTime(market, candidate.date, exchanges);
    if (
      candidatePredTime < targetPredTime &&
      (best === undefined || candidatePredTime > best.predTime)
    ) {
      best = { predTime: candidatePredTime, band: candidate.neutralBand };
    }
  }
  return best?.band ?? null;
}

export interface ProcessMarketDateParams {
  date: string;
  market: Market;
  /** 取引所マスタ全件（市場が設定されたもの）。学習は市場をまたぐため、対象市場だけに絞らない */
  exchanges: readonly ExchangeSessionInfo[];
  bars: readonly DailyBarInput[];
  source: 'LIVE' | 'REPLAY';
  now: number;
  /** true なら中立帯の見直し間隔によらず必ず判定し直す（稼働開始日用） */
  forceNeutralBandRecompute: boolean;
  deps: HandlerDependencies;
  sampleAccess: SampleAccess;
}

export interface ProcessMarketDateResult {
  scoredTickerOutcomes: number;
  scoredMarketOutcome: boolean;
  createdTickerForecasts: number;
  createdMarketForecast: boolean;
}

/**
 * 1つの (市場, 日付) について、採点 → 重みの更新 → 確度の算出の3段を進める。
 *
 * 通常モード（1回のバッチ実行で1市場1日）とリプレイモード（初期値算出で日付を1日ずつ進める）が
 * 共通で呼ぶ、確度算出バッチの中核処理。いずれの書き込みも条件付き（作成済みなら書かない・
 * 追記済みなら書かない）のため、同じ (市場, 日付) を再度呼んでも安全（冪等）。
 */
export async function processMarketDate(
  params: ProcessMarketDateParams
): Promise<ProcessMarketDateResult> {
  const {
    date,
    market,
    exchanges,
    bars,
    source,
    now,
    forceNeutralBandRecompute,
    deps,
    sampleAccess,
  } = params;

  const calendar = buildObservationCalendar(bars, exchanges);
  const marketDates = calendar[market] ?? [];
  const dateIndex = marketDates.indexOf(date);
  const prevDate = dateIndex > 0 ? marketDates[dateIndex - 1] : undefined;

  const result: ProcessMarketDateResult = {
    scoredTickerOutcomes: 0,
    scoredMarketOutcome: false,
    createdTickerForecasts: 0,
    createdMarketForecast: false,
  };

  // --- 段階1: 採点（前営業日の Forecast/MarketForecast に Outcome を追記し、PerformanceDaily を更新） ---
  if (prevDate !== undefined) {
    const { tickerOutcomes, marketOutcome } = computeOutcomeForDate(
      bars,
      prevDate,
      market,
      now,
      exchanges
    );

    // 銘柄ごとに独立した条件付き書き込みなので、直列 await を避けて並列実行する
    // （TICKER_WRITE_CONCURRENCY。リプレイの所要時間短縮）。
    const tickerOutcomeTasks = tickerOutcomes.map((outcome) => async () => {
      try {
        const appended = await deps.forecastRepository.appendOutcome(
          { tickerId: outcome.tickerId, date: prevDate },
          outcome
        );
        if (appended.updated) result.scoredTickerOutcomes++;
        sampleAccess.onTickerOutcomeAppended(outcome.tickerId, prevDate, outcome);
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          // 打ち切りでその日の Forecast 自体が無い銘柄。Forecast は書き換えない方針のため、
          // 後からサマリーが届いても採点はせず、このまま欠けた状態で確定させる
          logger.info('採点対象の Forecast が存在しないためスキップします', {
            market,
            date: prevDate,
            tickerId: outcome.tickerId,
          });
          return;
        }
        throw error;
      }
    });
    const { results: tickerOutcomeResults } = await runConcurrent(
      tickerOutcomeTasks,
      TICKER_WRITE_CONCURRENCY,
      () => false
    );
    const failedTickerOutcome = tickerOutcomeResults.find((r) => r.status === 'rejected');
    if (failedTickerOutcome && failedTickerOutcome.status === 'rejected') {
      throw failedTickerOutcome.reason;
    }

    if (marketOutcome !== undefined) {
      try {
        const appended = await deps.marketForecastRepository.appendOutcome(
          { market, date: prevDate },
          marketOutcome
        );
        if (appended.updated) result.scoredMarketOutcome = true;
        sampleAccess.onMarketOutcomeAppended(market, prevDate, marketOutcome);
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          logger.info('採点対象の MarketForecast が存在しないためスキップします', {
            market,
            date: prevDate,
          });
        } else {
          throw error;
        }
      }
    }

    const { tickers: tickerSamplesPrevDate, markets: marketSamplesPrevDate } =
      await sampleAccess.loadSamplesForDate(market, prevDate);
    for (const question of QUESTIONS) {
      const samples = question === 'MKT' ? marketSamplesPrevDate : tickerSamplesPrevDate;
      const performance = computePerformanceDaily(question, market, prevDate, samples, now);
      await deps.performanceDailyRepository.save(performance);
    }
  }

  // --- 段階2: 重みの更新（保存済みサンプルから ModelSnapshot(D) を条件付きで作る） ---
  const history = await sampleAccess.loadAllSamples();
  const allMarkets = distinctMarkets(exchanges);
  const targetPredTime = nominalMarketCloseTime(market, date, exchanges);
  const snapshots: Partial<Record<Question, ModelSnapshotItem>> = {};
  for (const question of QUESTIONS) {
    const previousNeutralBand = await getLatestNeutralBandAcrossMarkets(
      deps,
      question,
      allMarkets,
      exchanges,
      targetPredTime
    );
    const snapshot = computeModelSnapshot(question, history, date, market, exchanges, {
      previousNeutralBand,
      forceNeutralBandRecompute,
      now,
    });
    const created = await deps.modelSnapshotRepository.createIfAbsent(snapshot);
    snapshots[question] = created.item;
  }

  // --- 段階3: 確度の算出（D の軸の値・確率から Forecast(D)・MarketForecast(D) を条件付きで作る） ---
  const axisValues = computeAxisValuesForDate(bars, date, market, exchanges);
  const dirSnapshot = snapshots.DIR!;
  const volSnapshot = snapshots.VOL!;
  const mktSnapshot = snapshots.MKT!;
  const dirBurnInOk = hasEnoughTrainingData(dirSnapshot);
  const volBurnInOk = hasEnoughTrainingData(volSnapshot);
  const mktBurnInOk = hasEnoughTrainingData(mktSnapshot);

  // 書き込み対象を先に元の順序（buildPanel で銘柄IDの昇順に正準化済み）のまま組み立ててから
  // 並列に書き込む。アキュムレータへの反映は書き込み完了後にこの元の順序で行うことで、並列化の
  // 完了順（実行のたびに変わりうる）に依存せず、同じ入力なら常に同じ学習結果になるようにする
  // （浮動小数点の加算順序が変わると学習結果もわずかにずれるため）。
  const tickerCreations = axisValues.tickers.map((ticker) => {
    const probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>> = {};
    if (dirBurnInOk) {
      probabilities.DIR = computeProbabilityRecord('DIR', dirSnapshot, ticker.axisValues);
    }
    if (volBurnInOk && ticker.normal.range !== undefined) {
      probabilities.VOL = computeProbabilityRecord('VOL', volSnapshot, ticker.axisValues);
    }
    const sample: TickerSample = {
      tickerId: ticker.tickerId,
      exchangeId: ticker.exchangeId,
      market: ticker.market,
      date: ticker.date,
      axisValues: ticker.axisValues,
      normal: ticker.normal,
      probabilities: toTickerSampleProbabilities(probabilities),
    };
    return { ticker, probabilities, sample };
  });

  const tickerCreateTasks = tickerCreations.map(({ ticker, probabilities }) => async () => {
    const created = await deps.forecastRepository.createIfAbsent({
      TickerID: ticker.tickerId,
      ExchangeID: ticker.exchangeId,
      Market: ticker.market,
      Date: ticker.date,
      AxisValues: ticker.axisValues,
      Normal: ticker.normal,
      Probabilities: probabilities,
      ModelVersion: FORECAST_MODEL_VERSION,
      Source: source,
    });
    return created.created;
  });
  const { results: tickerCreateResults } = await runConcurrent(
    tickerCreateTasks,
    TICKER_WRITE_CONCURRENCY,
    () => false
  );
  const failedTickerCreate = tickerCreateResults.find((r) => r.status === 'rejected');
  if (failedTickerCreate && failedTickerCreate.status === 'rejected') {
    throw failedTickerCreate.reason;
  }
  for (const r of tickerCreateResults) {
    if (r.status === 'fulfilled' && r.value) result.createdTickerForecasts++;
  }
  for (const { sample } of tickerCreations) {
    sampleAccess.onTickerForecastCreated(sample);
  }

  if (axisValues.market !== undefined) {
    const probabilities: Partial<Record<'MKT', ProbabilityRecord>> = {};
    if (mktBurnInOk) {
      probabilities.MKT = computeProbabilityRecord(
        'MKT',
        mktSnapshot,
        axisValues.market.axisValues
      );
    }
    const created = await deps.marketForecastRepository.createIfAbsent({
      Market: axisValues.market.market,
      Date: axisValues.market.date,
      AxisValues: axisValues.market.axisValues,
      Probabilities: probabilities,
      ModelVersion: FORECAST_MODEL_VERSION,
      Source: source,
    });
    if (created.created) result.createdMarketForecast = true;
    sampleAccess.onMarketForecastCreated({
      market: axisValues.market.market,
      date: axisValues.market.date,
      axisValues: axisValues.market.axisValues,
      probabilities: toMarketSampleProbabilities(probabilities),
    });
  }

  return result;
}

/**
 * 揃った判定。
 *
 * 観測カレンダーの前日に DailySummary があった銘柄が、すべて D のサマリーを持てば true。
 * 前日が無い（D がその市場の最初の観測日）場合は判定対象が無いため true とする。
 */
function isMarketDateReady(
  bars: readonly DailyBarInput[],
  date: string,
  prevDate: string | undefined
): boolean {
  if (prevDate === undefined) return true;
  const prevTickers = new Set(bars.filter((b) => b.date === prevDate).map((b) => b.tickerId));
  const currentTickers = new Set(bars.filter((b) => b.date === date).map((b) => b.tickerId));
  for (const tickerId of prevTickers) {
    if (!currentTickers.has(tickerId)) return false;
  }
  return true;
}

/**
 * 市場のサマリーを読む（確度算出に使う属性だけの射影）。過去データ除外の境界日が
 * 与えられていれば適用する（A.4）。
 */
async function loadMarketBars(
  market: Market,
  exchanges: readonly ExchangeSessionInfo[],
  deps: HandlerDependencies,
  fromDate: string,
  toDate: string,
  legacyExclusionBefore: string | undefined
): Promise<DailyBarInput[]> {
  const marketExchangeIds = exchanges.filter((e) => e.market === market).map((e) => e.exchangeId);
  const bars: DailyBarInput[] = [];
  for (const exchangeId of marketExchangeIds) {
    const summaries = await deps.dailySummaryRepository.getForecastFieldsByExchangeAndDateRange(
      exchangeId,
      fromDate,
      toDate
    );
    bars.push(...summaries.map(toDailyBarInput));
  }
  return legacyExclusionBefore !== undefined
    ? excludeLegacyBackfillRows(bars, exchanges, legacyExclusionBefore)
    : bars;
}

async function processMarket(
  market: Market,
  exchanges: readonly ExchangeSessionInfo[],
  deps: HandlerDependencies,
  now: number,
  legacyExclusionBefore: string | undefined,
  stats: NormalBatchStatistics
): Promise<void> {
  // 稼働開始前ガード: リプレイが1回も実行されていない市場では通常モードは何もしない
  // （重みの更新が「保存済みサンプルからの再推定」である以上、種になる過去データが要る）。
  const lastSnapshot = await deps.modelSnapshotRepository.getLatestBefore(
    'DIR',
    market,
    REPLAY_LATEST_DATE
  );
  if (lastSnapshot === null) {
    logger.info('リプレイ未実施のためスキップします', { market });
    stats.replayNotDone++;
    return;
  }
  const lastProcessedDate = lastSnapshot.date;

  const fromDate = toYmd(ymdToMs(lastProcessedDate) - NORMAL_MODE_LOOKBACK_DAYS * MS_PER_DAY);
  const toDate = toYmd(now + MS_PER_DAY);
  const bars = await loadMarketBars(
    market,
    exchanges,
    deps,
    fromDate,
    toDate,
    legacyExclusionBefore
  );

  const calendar = buildObservationCalendar(bars, exchanges);
  const marketDates = calendar[market] ?? [];
  if (marketDates.length === 0) {
    logger.info('市場のサマリーがまだ無いためスキップします', { market });
    stats.noMarketData++;
    return;
  }

  // 未処理の日を古い順に処理する。前回の実行が段階2（ModelSnapshot 作成）の後・段階3
  // （Forecast/MarketForecast 作成）の前で終わっていた場合に備え、lastProcessedDate 自身も
  // MarketForecast が無ければ処理対象に含める（再実行は各段が条件付き書き込みのため安全）。
  const candidateDates = marketDates.filter((d) => d >= lastProcessedDate);
  let pendingDates = candidateDates;
  if (candidateDates.length > 0 && candidateDates[0] === lastProcessedDate) {
    const lastMarketForecast = await deps.marketForecastRepository.getByMarketAndDate(
      market,
      lastProcessedDate
    );
    if (lastMarketForecast !== null) {
      pendingDates = candidateDates.slice(1);
    }
  }

  if (pendingDates.length === 0) {
    logger.info('最新日はすでに確度算出済みのためスキップします', {
      market,
      date: marketDates[marketDates.length - 1],
    });
    stats.alreadyUpToDate++;
    return;
  }

  const sampleAccess = createDbSampleAccess(deps, exchanges);
  let processedCount = 0;

  for (const targetDate of pendingDates) {
    if (processedCount >= MAX_DATES_PER_RUN) {
      logger.info('1回の実行で処理する日数の上限に達したため、残りは次回の実行に回します', {
        market,
        remaining: pendingDates.length - processedCount,
      });
      break;
    }

    // 引け前のガード: D の名目引け時刻より前なら、その日のサマリーはまだ確定していない
    const closeTime = nominalMarketCloseTime(market, targetDate, exchanges);
    if (now < closeTime) {
      logger.info('名目引け時刻より前のため処理しません', { market, date: targetDate });
      break;
    }

    const dateIndex = marketDates.indexOf(targetDate);
    const prevDate = dateIndex > 0 ? marketDates[dateIndex - 1] : undefined;

    if (!isMarketDateReady(bars, targetDate, prevDate)) {
      const cutoff = closeTime + CUTOFF_MS_AFTER_CLOSE;
      if (now < cutoff) {
        logger.info('銘柄のサマリーがまだ揃っていないため待機します', { market, date: targetDate });
        stats.waitingForData++;
        break;
      }
      logger.info('打ち切り時刻を過ぎたため、揃っている銘柄だけで確度を算出します', {
        market,
        date: targetDate,
      });
    }

    const result = await processMarketDate({
      date: targetDate,
      market,
      exchanges,
      bars,
      source: 'LIVE',
      now,
      forceNeutralBandRecompute: false,
      deps,
      sampleAccess,
    });
    processedCount++;
    stats.processedDates++;
    logger.info('市場の確度算出が完了しました', { market, date: targetDate, ...result });
  }

  if (processedCount > 0) {
    stats.processedMarkets++;
  }
}

async function handleScheduled(
  event: ScheduledEvent,
  deps: HandlerDependencies
): Promise<HandlerResponse> {
  const stats: NormalBatchStatistics = {
    totalMarkets: 0,
    processedMarkets: 0,
    processedDates: 0,
    replayNotDone: 0,
    alreadyUpToDate: 0,
    waitingForData: 0,
    noMarketData: 0,
    errors: 0,
  };
  const failedMarkets: Market[] = [];
  const legacyExclusionBefore = process.env.STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE;

  const now = deps.nowFn();
  const exchanges = await deps.exchangeRepository.getAll();
  const { known: sessionInfos, skippedExchangeIds } = toSessionInfos(exchanges);
  if (skippedExchangeIds.length > 0) {
    logger.info('市場未設定の取引所を除外しました', { skippedExchangeIds });
  }

  const markets = distinctMarkets(sessionInfos);
  stats.totalMarkets = markets.length;

  for (const market of markets) {
    try {
      await processMarket(market, sessionInfos, deps, now, legacyExclusionBefore, stats);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error('市場の確度算出バッチでエラーが発生しました', { market, error: errorMessage });
      await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: '確度算出バッチ: 市場処理失敗',
        message: errorMessage,
        context: { market, errorStack: error instanceof Error ? error.stack : undefined },
      });
      stats.errors++;
      failedMarkets.push(market);
    }
  }

  logger.info('確度算出バッチが完了しました', { eventId: event.id, statistics: stats });

  // 他の市場の処理を済ませた後、いずれかの市場が失敗していれば最後に例外を投げて
  // Lambda の呼び出し自体をエラーにする（CloudWatch のエラー率アラームで検知できるようにする）。
  if (stats.errors > 0) {
    // 市場ごとの個別報告は済んでいるため、骨格の報告は「致命的エラー」ではなく部分失敗として区別する。
    throw new ScheduledHandlerError(
      `確度算出バッチで一部の市場の処理に失敗しました（失敗数: ${stats.errors}）: ${JSON.stringify(stats)}`,
      {
        title: '確度算出バッチ: 部分失敗',
        context: { statistics: stats, failedMarkets },
      }
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '確度算出バッチが正常に完了しました',
      statistics: stats,
    }),
  };
}

/** 最終日のスナップショットの要約（問いごとの学習件数・基準値・中立帯） */
async function summarizeLatestSnapshots(
  deps: HandlerDependencies,
  market: Market,
  date: string
): Promise<Record<string, unknown>> {
  const questions: Partial<
    Record<
      Question,
      {
        trainingSize: number;
        distinctTrainingDates: number;
        baseline: number;
        neutralBand: { lower: number; upper: number };
      }
    >
  > = {};
  for (const question of QUESTIONS) {
    const snapshot = await deps.modelSnapshotRepository.getByDate(question, market, date);
    if (snapshot !== null) {
      questions[question] = {
        trainingSize: snapshot.trainingSize,
        distinctTrainingDates: snapshot.distinctTrainingDates,
        baseline: snapshot.baseline,
        neutralBand: { lower: snapshot.neutralBand.lower, upper: snapshot.neutralBand.upper },
      };
    }
  }
  return { market, date, questions };
}

async function handleReplay(
  event: ReplayEvent,
  deps: HandlerDependencies
): Promise<HandlerResponse> {
  logger.info('確度算出バッチ（リプレイ）を開始します', {
    legacyExclusionBefore: event.legacyExclusionBefore,
    from: event.from,
    to: event.to,
  });

  const stats: ReplayBatchStatistics = {
    totalSteps: 0,
    processedSteps: 0,
    alreadyDone: 0,
    errors: 0,
  };

  let stoppedAt: { market: Market; date: string; reason: string } | undefined;
  let lastProcessed: { market: Market; date: string } | undefined;
  const now = deps.nowFn();
  const exchanges = await deps.exchangeRepository.getAll();
  const { known: sessionInfos, skippedExchangeIds } = toSessionInfos(exchanges);
  if (skippedExchangeIds.length > 0) {
    logger.info('市場未設定の取引所を除外しました', { skippedExchangeIds });
  }

  const bars: DailyBarInput[] = [];
  for (const exchange of sessionInfos) {
    const summaries = await deps.dailySummaryRepository.getForecastFieldsByExchangeAndDateRange(
      exchange.exchangeId,
      REPLAY_EARLIEST_DATE,
      REPLAY_LATEST_DATE
    );
    bars.push(...summaries.map(toDailyBarInput));
  }
  const excludedBars = excludeLegacyBackfillRows(bars, sessionInfos, event.legacyExclusionBefore);

  const calendar = buildObservationCalendar(excludedBars, sessionInfos);
  const steps: { market: Market; date: string }[] = [];
  for (const market of Object.keys(calendar)) {
    for (const date of calendar[market]) {
      if (event.from !== undefined && date < event.from) continue;
      if (event.to !== undefined && date > event.to) continue;
      steps.push({ market, date });
    }
  }
  steps.sort(
    (a, b) =>
      nominalMarketCloseTime(a.market, a.date, sessionInfos) -
      nominalMarketCloseTime(b.market, b.date, sessionInfos)
  );
  stats.totalSteps = steps.length;

  // to を指定した分割実行では、明示しない限り中立帯の強制判定はしない
  // （その回の最終日が稼働開始日とは限らないため）。
  const forceNeutralBandOnDate =
    event.forceNeutralBandOn ??
    (event.to === undefined && steps.length > 0 ? steps[steps.length - 1].date : undefined);

  const store = await seedReplaySampleStore(deps, sessionInfos);
  const sampleAccess = createReplaySampleAccess(store);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLastStep = i === steps.length - 1;

    const existing = await deps.marketForecastRepository.getByMarketAndDate(step.market, step.date);
    if (existing !== null) {
      stats.alreadyDone++;
      continue;
    }

    // リプレイ対象期間の最終日は、通常モードと同じ揃った判定・打ち切り判定をかける
    // （そこがまだ引け前後で銘柄のサマリーが出揃っていない可能性があるため）。
    // それより前の日は、対象期間全体の DailySummary を読み終えた時点で確定済みとみなせる。
    if (isLastStep) {
      const marketDates = calendar[step.market] ?? [];
      const dateIndex = marketDates.indexOf(step.date);
      const prevDate = dateIndex > 0 ? marketDates[dateIndex - 1] : undefined;
      if (!isMarketDateReady(excludedBars, step.date, prevDate)) {
        const cutoff =
          nominalMarketCloseTime(step.market, step.date, sessionInfos) + CUTOFF_MS_AFTER_CLOSE;
        if (now < cutoff) {
          logger.info('リプレイ最終日の銘柄サマリーがまだ揃っていないため処理しません', {
            market: step.market,
            date: step.date,
          });
          break;
        }
        logger.info('打ち切り時刻を過ぎたため、揃っている銘柄だけで確度を算出します', {
          market: step.market,
          date: step.date,
        });
      }
    }

    try {
      await processMarketDate({
        date: step.date,
        market: step.market,
        exchanges: sessionInfos,
        bars: excludedBars,
        source: 'REPLAY',
        now,
        forceNeutralBandRecompute: step.date === forceNeutralBandOnDate,
        deps,
        sampleAccess,
      });
      stats.processedSteps++;
      lastProcessed = step;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      // 続行すると、このステップの前営業日の採点（Outcome 追記）が恒久的に書き漏れる
      // （Forecast は書き換えない方針のため後から補えない）ため、最初のエラーで止める。
      stoppedAt = { market: step.market, date: step.date, reason: errorMessage };
      logger.error('リプレイのステップでエラーが発生しました', {
        market: step.market,
        date: step.date,
        error: errorMessage,
      });
      await reportErrorEvent({
        serviceId: 'stock-tracker',
        severity: 'error',
        title: '確度算出バッチ（リプレイ）: ステップ処理失敗',
        message: errorMessage,
        context: {
          market: step.market,
          date: step.date,
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      stats.errors++;
      break;
    }
  }

  const snapshotSummary: Record<string, unknown> | undefined = lastProcessed
    ? await summarizeLatestSnapshots(deps, lastProcessed.market, lastProcessed.date)
    : undefined;

  logger.info('確度算出バッチ（リプレイ）が完了しました', {
    statistics: stats,
    stoppedAt,
    snapshotSummary,
  });

  if (stoppedAt !== undefined) {
    // ステップごとの個別報告は済んでいるため、骨格の報告は「致命的エラー」ではなく停止として区別する。
    throw new ScheduledHandlerError(
      `リプレイが ${stoppedAt.market} ${stoppedAt.date} で停止しました: ${stoppedAt.reason}（統計: ${JSON.stringify(stats)}）`,
      {
        title: '確度算出バッチ（リプレイ）: 停止',
        context: { statistics: stats, stoppedAt },
      }
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '確度算出バッチ（リプレイ）が正常に完了しました',
      statistics: stats,
      snapshotSummary,
    }),
  };
}

function resolveDependencies(dependencies?: Partial<HandlerDependencies>): HandlerDependencies {
  if (
    dependencies?.exchangeRepository &&
    dependencies?.dailySummaryRepository &&
    dependencies?.forecastRepository &&
    dependencies?.marketForecastRepository &&
    dependencies?.modelSnapshotRepository &&
    dependencies?.performanceDailyRepository
  ) {
    return {
      exchangeRepository: dependencies.exchangeRepository,
      dailySummaryRepository: dependencies.dailySummaryRepository,
      forecastRepository: dependencies.forecastRepository,
      marketForecastRepository: dependencies.marketForecastRepository,
      modelSnapshotRepository: dependencies.modelSnapshotRepository,
      performanceDailyRepository: dependencies.performanceDailyRepository,
      nowFn: dependencies.nowFn ?? Date.now,
    };
  }

  const docClient = getDynamoDBDocumentClient();
  const tableName = getTableName();
  return {
    exchangeRepository: new DynamoDBExchangeRepository(docClient, tableName),
    dailySummaryRepository: new DynamoDBDailySummaryRepository(docClient, tableName),
    forecastRepository: new DynamoDBForecastRepository(docClient, tableName),
    marketForecastRepository: new DynamoDBMarketForecastRepository(docClient, tableName),
    modelSnapshotRepository: new DynamoDBModelSnapshotRepository(docClient, tableName),
    performanceDailyRepository: new DynamoDBPerformanceDailyRepository(docClient, tableName),
    nowFn: dependencies?.nowFn ?? Date.now,
  };
}

/**
 * Lambda Handler
 *
 * イベントに `mode: 'replay'` があればリプレイモード、無ければ通常モード（EventBridge /
 * summary バッチからの起動）として処理する。
 */
export async function handler(
  event: ForecastBatchEvent,
  dependencies?: Partial<HandlerDependencies>
): Promise<HandlerResponse> {
  const resolved = resolveDependencies(dependencies);
  const run = createScheduledHandler<ForecastBatchEvent>(
    { serviceId: 'stock-tracker', name: 'forecast', errorTitle: '確度算出バッチ: 致命的エラー' },
    (batchEvent) =>
      isReplayEvent(batchEvent)
        ? handleReplay(batchEvent, resolved)
        : handleScheduled(batchEvent, resolved)
  );
  return run(event);
}
