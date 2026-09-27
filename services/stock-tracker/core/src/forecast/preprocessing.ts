/**
 * Stock Tracker Core - Forecast 前処理（design.md §1.1・§1.2、参照実装 analysis/prep.py 相当）
 *
 * DailySummary 相当の入力から、観測カレンダー・翌営業日の判定・判断軸の値・実績（採点前の生の目的変数）を
 * 純粋関数として組み立てる。DB アクセスは含まない（NFR-4）。
 */
import { PATTERN_REGISTRY } from '../patterns/pattern-registry.js';
import {
  AXIS_ID_BUY_COUNT_GE2,
  AXIS_ID_MARKET_PARKINSON_5D,
  AXIS_ID_MARKET_RANGE_TODAY,
  AXIS_ID_MARKET_VOLUME_RATIO,
  AXIS_ID_PARKINSON_5D,
  AXIS_ID_RANGE_TODAY,
  AXIS_ID_SELL_COUNT_GE2,
  AXIS_ID_VOLUME_RATIO,
  PATTERN_AXIS_IDS,
} from './axes.js';
import {
  EXTREME_RETURN_THRESHOLD,
  LEGACY_BACKFILL_HOLIDAY_COPY_DATES,
  NORMAL_WINDOW,
  PARKINSON_WINDOW,
  type Market,
} from './constants.js';
import {
  getMarketForExchange,
  getNextCalendarDate,
  nominalCloseTime,
  nominalOpenTime,
} from './time.js';
import type { AxisId, DailyBarInput } from './types.js';

const BUY_PATTERN_IDS = new Set(
  PATTERN_REGISTRY.filter((pattern) => pattern.definition.signalType === 'BUY').map(
    (p) => p.definition.patternId
  )
);
const SELL_PATTERN_IDS = new Set(
  PATTERN_REGISTRY.filter((pattern) => pattern.definition.signalType === 'SELL').map(
    (p) => p.definition.patternId
  )
);

/** 銘柄×日 1 行（判断軸の値・実績のもとになる生データを含む） */
export interface TickerDaySample {
  tickerId: string;
  exchangeId: string;
  market: Market;
  date: string;
  /** 名目引け時刻 (UTC ms)。この行を「予測対象」として扱うときの基準 */
  predTime: number;
  close: number;
  /** 同一銘柄の次のレコードの日付（データが欠落していれば観測カレンダー上の翌営業日と一致しない） */
  nextDate?: string;
  /** 翌営業日が観測カレンダーと一致するか */
  nextOk: boolean;
  /** 翌営業日の名目引け時刻 (UTC ms)。nextOk のときのみ */
  labelTime?: number;
  /** 単一パターン27 + 複合パターン2（Q-DIR 用。常に 0/1 で埋まる） */
  flags: Record<AxisId, number>;
  /** 当日の値幅の平常比 (log)。値なしのとき undefined */
  rangeToday?: number;
  /** 直近5日の値幅(Parkinson)の平常比 (log)。値なしのとき undefined */
  parkinson5d?: number;
  /** 出来高の平常比 (log)。値なしのとき undefined */
  volumeRatio?: number;
  /** 市場レベル軸（同日・同市場の銘柄の大きさ軸の平均）。VOL 用に付与 */
  marketParkinson5d?: number;
  marketRangeToday?: number;
  marketVolumeRatio?: number;
  /** 平常（値幅の直近20レコード平均） */
  normalRange?: number;
  /** 平常（出来高の直近20レコード平均） */
  normalVolume?: number;
  /** 当日の値幅（生値。市場平均値幅の算出に使う） */
  rawRangeToday?: number;
  /** Q-DIR の目的変数（0/1）。値なしのとき undefined（除外含む） */
  yDir?: number;
  /** Q-VOL の目的変数（0/1）。値なしのとき undefined */
  yVol?: number;
  /** 超過リターン（同日・同市場の有効銘柄平均との差）。除外時は undefined */
  excessReturn?: number;
  /** 採点用の生データ（nextOk のときのみ） */
  outcomeRaw?: {
    nextReturn: number;
    nextRawRange: number;
    excludedExtremeReturn: boolean;
  };
}

/** 市場×日 1 行（Q-MKT 用。参照実装 prep.py の mkt パネルに相当） */
export interface MarketDaySample {
  market: Market;
  date: string;
  predTime: number;
  nextDate?: string;
  nextOk: boolean;
  labelTime?: number;
  /** その日の有効銘柄（値幅が定義できた銘柄）の値幅平均 */
  meanRangeToday?: number;
  /** 平常比 3 軸（Q-VOL・Q-MKT 共通） */
  marketParkinson5d?: number;
  marketRangeToday?: number;
  marketVolumeRatio?: number;
  /** 市場平均値幅の平常比（Q-MKT のみ） */
  marketRangeAvg?: number;
  /** 平常（市場平均値幅の直近20市場日平均） */
  normalMeanRange?: number;
  /** Q-MKT の目的変数 */
  yMkt?: number;
  outcomeRaw?: {
    nextMeanRawRange: number;
  };
}

export interface PreprocessedPanel {
  calendar: Record<Market, string[]>;
  tickerSamples: TickerDaySample[];
  marketSamples: MarketDaySample[];
}

/**
 * 市場の観測カレンダー（design.md §1.1）: いずれかの銘柄の DailySummary がある日付の集合。
 */
export function buildObservationCalendar(bars: readonly DailyBarInput[]): Record<Market, string[]> {
  const sets: Record<Market, Set<string>> = { JP: new Set(), US: new Set() };
  for (const bar of bars) {
    const market = getMarketForExchange(bar.exchangeId);
    sets[market].add(bar.date);
  }
  return {
    JP: [...sets.JP].sort(),
    US: [...sets.US].sort(),
  };
}

/**
 * #3830 の過去データ除外（初期値算出でのみ使う。design.md 必読メモ・§1.1）。
 *
 * 除外1: 休場日コピー足の日付、または前レコードと OHLC が完全一致
 * 除外2: CreatedAt が翌営業日の取引開始時刻以降（途中足）
 *
 * 除外1適用後の観測カレンダーで除外2の翌営業日を決める（参照実装 prep.py と同じ順序）。
 */
export function excludeLegacyBackfillRows(bars: readonly DailyBarInput[]): DailyBarInput[] {
  const byTicker = groupByTicker(bars);

  // 除外1: 休場日コピー足 + 前レコードと OHLC 完全一致
  const afterFirstExclusion: DailyBarInput[] = [];
  for (const [, rows] of byTicker) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const bar = sorted[i];
      const market = getMarketForExchange(bar.exchangeId);
      const isHoliday = LEGACY_BACKFILL_HOLIDAY_COPY_DATES[market].includes(bar.date);
      const prev = i > 0 ? sorted[i - 1] : undefined;
      const isSameOhlc =
        prev !== undefined &&
        prev.open === bar.open &&
        prev.high === bar.high &&
        prev.low === bar.low &&
        prev.close === bar.close;
      if (!isHoliday && !isSameOhlc) {
        afterFirstExclusion.push(bar);
      }
    }
  }

  // 除外1後の観測カレンダーで翌営業日を決める
  const calendar = buildObservationCalendar(afterFirstExclusion);

  // 除外2: 途中足（CreatedAt が翌営業日の取引開始以降）
  return afterFirstExclusion.filter((bar) => {
    const market = getMarketForExchange(bar.exchangeId);
    const nextDate = getNextCalendarDate(calendar[market], bar.date);
    if (nextDate === undefined) {
      return true;
    }
    const sessionOpen = nominalOpenTime(nextDate, market);
    return bar.createdAt < sessionOpen;
  });
}

function groupByTicker(bars: readonly DailyBarInput[]): Map<string, DailyBarInput[]> {
  const map = new Map<string, DailyBarInput[]>();
  for (const bar of bars) {
    const list = map.get(bar.tickerId);
    if (list) {
      list.push(bar);
    } else {
      map.set(bar.tickerId, [bar]);
    }
  }
  return map;
}

/**
 * 直近 window 件がすべて定義されている場合のみ平均を返す（pandas rolling(window, min_periods=window) と同じ）。
 */
function rollingMeanFullWindow(
  values: readonly (number | undefined)[],
  window: number
): (number | undefined)[] {
  const result = new Array<number | undefined>(values.length).fill(undefined);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < window) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (v === undefined) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) {
      result[i] = sum / window;
    }
  }
  return result;
}

/** グループ内平均（undefined は無視。1件も無ければ undefined） */
function meanIgnoringUndefined(values: readonly (number | undefined)[]): number | undefined {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v !== undefined) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : undefined;
}

/**
 * DailySummary 相当のバー配列から、判断軸の値・実績（採点前の生の目的変数）を計算する。
 *
 * 将来データの排除は行わない（呼び出し側 = 学習・基準値・予測の各関数が、時刻の規則で
 * 必要な範囲だけをフィルタする。NFR-4 の「切り詰め不変性」を成り立たせるため）。
 */
export function buildPanel(bars: readonly DailyBarInput[]): PreprocessedPanel {
  const calendar = buildObservationCalendar(bars);
  const byTicker = groupByTicker(bars);

  const tickerSamples: TickerDaySample[] = [];

  for (const [tickerId, rows] of byTicker) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;
    const market = getMarketForExchange(sorted[0].exchangeId);

    const rangeSeries: (number | undefined)[] = new Array(n).fill(undefined);
    const lhl2Series: (number | undefined)[] = new Array(n).fill(undefined);
    const volumeSeries: (number | undefined)[] = new Array(n).fill(undefined);

    for (let i = 0; i < n; i++) {
      const bar = sorted[i];
      const prevClose = i > 0 ? sorted[i - 1].close : undefined;
      if (prevClose !== undefined) {
        const range = (bar.high - bar.low) / prevClose;
        rangeSeries[i] = range > 0 ? range : undefined;
      }
      if (bar.high > 0 && bar.low > 0) {
        lhl2Series[i] = Math.log(bar.high / bar.low) ** 2;
      }
      volumeSeries[i] = bar.volume !== undefined && bar.volume > 0 ? bar.volume : undefined;
    }

    const park5Series = rollingMeanFullWindow(lhl2Series, PARKINSON_WINDOW).map((v) =>
      v === undefined ? undefined : Math.sqrt(v / (4 * Math.log(2)))
    );
    const normalRangeSeries = rollingMeanFullWindow(rangeSeries, NORMAL_WINDOW);
    // 平常の Parkinson は「5日窓の park5 の20日平均」ではなく、生の lhl2 を直接20日窓で
    // rolling した Parkinson 推定量（参照実装 prep.py の npark{N} と同じ）。lhl2 は当日の
    // High/Low だけで決まり欠損しないため、20件目から定義される。
    const normalParkSeries = rollingMeanFullWindow(lhl2Series, NORMAL_WINDOW).map((v) =>
      v === undefined ? undefined : Math.sqrt(v / (4 * Math.log(2)))
    );
    const normalVolumeSeries = rollingMeanFullWindow(volumeSeries, NORMAL_WINDOW);

    for (let i = 0; i < n; i++) {
      const bar = sorted[i];
      const next = i + 1 < n ? sorted[i + 1] : undefined;
      const calNext = getNextCalendarDate(calendar[market], bar.date);
      const nextOk = next !== undefined && next.date === calNext;

      const flags: Record<AxisId, number> = {};
      let buyCount = 0;
      let sellCount = 0;
      for (const patternId of PATTERN_AXIS_IDS) {
        const status = bar.patternResults?.[patternId];
        const lit = status === 'MATCHED' ? 1 : 0;
        flags[patternId] = lit;
        if (lit === 1) {
          if (BUY_PATTERN_IDS.has(patternId)) buyCount += 1;
          if (SELL_PATTERN_IDS.has(patternId)) sellCount += 1;
        }
      }
      flags[AXIS_ID_BUY_COUNT_GE2] = buyCount >= 2 ? 1 : 0;
      flags[AXIS_ID_SELL_COUNT_GE2] = sellCount >= 2 ? 1 : 0;

      const range = rangeSeries[i];
      const park5 = park5Series[i];
      const vol = volumeSeries[i];
      const normalRange = normalRangeSeries[i];
      const normalPark = normalParkSeries[i];
      const normalVolume = normalVolumeSeries[i];

      const rangeToday =
        range !== undefined && normalRange !== undefined && normalRange > 0
          ? Math.log(range / normalRange)
          : undefined;
      const parkinson5d =
        park5 !== undefined && normalPark !== undefined && normalPark > 0
          ? Math.log(park5 / normalPark)
          : undefined;
      const volumeRatio =
        vol !== undefined && normalVolume !== undefined && normalVolume > 0
          ? Math.log(vol / normalVolume)
          : undefined;

      const sample: TickerDaySample = {
        tickerId,
        exchangeId: bar.exchangeId,
        market,
        date: bar.date,
        predTime: nominalCloseTime(bar.date, market),
        close: bar.close,
        nextDate: next?.date,
        nextOk,
        labelTime: nextOk ? nominalCloseTime(next!.date, market) : undefined,
        flags,
        rangeToday,
        parkinson5d,
        volumeRatio,
        normalRange,
        normalVolume,
        rawRangeToday: range,
      };

      if (nextOk && next !== undefined) {
        const nextReturnRaw = next.close / bar.close - 1;
        const nextRawRange = next.high - next.low;
        const excludedExtremeReturn = Math.abs(nextReturnRaw) > EXTREME_RETURN_THRESHOLD;
        sample.outcomeRaw = { nextReturn: nextReturnRaw, nextRawRange, excludedExtremeReturn };
      }

      tickerSamples.push(sample);
    }
  }

  // --- 市場レベルの平均（同日・同市場、大きさ軸に値がある銘柄の平均。design.md §1.2 の後段）
  const byMarketDate = new Map<string, TickerDaySample[]>();
  for (const sample of tickerSamples) {
    const key = `${sample.market}#${sample.date}`;
    const list = byMarketDate.get(key);
    if (list) list.push(sample);
    else byMarketDate.set(key, [sample]);
  }
  for (const list of byMarketDate.values()) {
    const marketParkinson5d = meanIgnoringUndefined(list.map((s) => s.parkinson5d));
    const marketRangeToday = meanIgnoringUndefined(list.map((s) => s.rangeToday));
    const marketVolumeRatio = meanIgnoringUndefined(list.map((s) => s.volumeRatio));
    for (const sample of list) {
      sample.marketParkinson5d = marketParkinson5d;
      sample.marketRangeToday = marketRangeToday;
      sample.marketVolumeRatio = marketVolumeRatio;
    }
  }

  // --- 実績（ret1・超過リターン・Q-DIR/Q-VOL の目的変数）
  // 有効銘柄: 翌営業日が一致し、除外理由（極端リターン）が無い銘柄
  for (const list of byMarketDate.values()) {
    const validReturns = list
      .filter((s) => s.outcomeRaw !== undefined && !s.outcomeRaw.excludedExtremeReturn)
      .map((s) => s.outcomeRaw!.nextReturn);
    const meanValidReturn = meanIgnoringUndefined(validReturns);
    for (const sample of list) {
      if (sample.outcomeRaw === undefined) continue;
      if (sample.outcomeRaw.excludedExtremeReturn) {
        // 除外: Q-DIR の目的変数は作らない（参照実装で ret1 が NaN になり excess も NaN になる）
        continue;
      }
      if (meanValidReturn === undefined) continue;
      const excess = sample.outcomeRaw.nextReturn - meanValidReturn;
      sample.excessReturn = excess;
      sample.yDir = excess > 0 ? 1 : 0;
      if (sample.normalRange !== undefined) {
        const rangeNextRatio = sample.outcomeRaw.nextRawRange / sample.close / sample.normalRange;
        sample.yVol = rangeNextRatio > 1 ? 1 : 0;
      }
    }
  }

  // --- 市場×日パネル（Q-MKT）
  const marketSamples: MarketDaySample[] = [];
  const marketRowsByMarket: Record<Market, MarketDaySample[]> = { JP: [], US: [] };
  for (const market of ['JP', 'US'] as const) {
    for (const date of calendar[market]) {
      const list = byMarketDate.get(`${market}#${date}`) ?? [];
      const meanRangeToday = meanIgnoringUndefined(list.map((s) => s.rawRangeToday));
      const marketParkinson5d = list.length > 0 ? list[0].marketParkinson5d : undefined;
      const marketRangeToday = list.length > 0 ? list[0].marketRangeToday : undefined;
      const marketVolumeRatio = list.length > 0 ? list[0].marketVolumeRatio : undefined;
      const row: MarketDaySample = {
        market,
        date,
        predTime: nominalCloseTime(date, market),
        nextOk: false,
        meanRangeToday,
        marketParkinson5d,
        marketRangeToday,
        marketVolumeRatio,
      };
      marketSamples.push(row);
      marketRowsByMarket[market].push(row);
    }
  }

  for (const market of ['JP', 'US'] as const) {
    const rows = marketRowsByMarket[market];
    const meanRangeSeries = rows.map((r) => r.meanRangeToday);
    const normalMeanRangeSeries = rollingMeanFullWindow(meanRangeSeries, NORMAL_WINDOW);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      row.normalMeanRange = normalMeanRangeSeries[i];
      row.marketRangeAvg =
        row.meanRangeToday !== undefined &&
        row.normalMeanRange !== undefined &&
        row.normalMeanRange > 0
          ? Math.log(row.meanRangeToday / row.normalMeanRange)
          : undefined;

      const next = i + 1 < rows.length ? rows[i + 1] : undefined;
      const calNext = getNextCalendarDate(calendar[market], row.date);
      const nextOk = next !== undefined && next.date === calNext;
      row.nextDate = next?.date;
      row.nextOk = nextOk;
      row.labelTime = nextOk ? nominalCloseTime(next!.date, market) : undefined;

      if (nextOk) {
        // Rn = 当日のグループの各銘柄の rng_next（翌日の値幅 ÷ 当日終値）の平均
        const currentTickerRows = byMarketDate.get(`${market}#${row.date}`) ?? [];
        const nextRangeValues = currentTickerRows
          .filter((s) => s.outcomeRaw !== undefined && !s.outcomeRaw.excludedExtremeReturn)
          .map((s) => s.outcomeRaw!.nextRawRange / s.close);
        const nextMeanRawRange = meanIgnoringUndefined(nextRangeValues);
        if (nextMeanRawRange !== undefined) {
          row.outcomeRaw = { nextMeanRawRange };
          if (row.normalMeanRange !== undefined) {
            row.yMkt = nextMeanRawRange > row.normalMeanRange ? 1 : 0;
          }
        }
      }
    }
  }

  return { calendar, tickerSamples, marketSamples };
}

export { AXIS_ID_MARKET_PARKINSON_5D, AXIS_ID_MARKET_RANGE_TODAY, AXIS_ID_MARKET_VOLUME_RATIO };
export { AXIS_ID_PARKINSON_5D, AXIS_ID_RANGE_TODAY, AXIS_ID_VOLUME_RATIO };
