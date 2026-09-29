import type {
  AxisBreakdown,
  BandHistoryView,
  ForecastQuestion,
  ProbabilityView,
  QuestionDetail,
  TickerForecastSummary,
} from '../../types/forecast';

/**
 * 確度の表示用ロジック。
 *
 * client component から参照されるため、core の値を import しない
 * （core の値を client バンドルへ持ち込むとビルドが壊れる）。
 */

/** 確度がないときの表示 */
export const FORECAST_UNAVAILABLE = '—';

export const FORECAST_TEXT = {
  NO_FORECAST: 'この日の確度はありません',
  NO_HISTORY: '履歴が足りず算出できません',
  LOW_SAMPLE_BAND: '件数が少なく参考値',
  LOW_SAMPLE_AXIS: '件数不足',
  LOW_SAMPLE_MARKET: '過去の日数が少なく参考値',
  NEUTRAL: '中立',
  CALM: '平常',
  UP: '強含み',
  DOWN: '弱含み',
  HIGH: '荒れそう',
} as const;

/** 帯の実績の件数がこの値未満なら参考値扱いにする */
export const BAND_LOW_SAMPLE_THRESHOLD = 30;

/** ラベルの色調。中立・平常は控えめな色にする */
export type ForecastTone = 'up' | 'down' | 'high' | 'muted' | 'none';

export interface ForecastLabel {
  /** 「強含み 56%」「中立」「—」など */
  text: string;
  tone: ForecastTone;
}

/** 確率(0〜1)を整数 % 文字列にする */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * 確度のラベルを返す。
 *
 * 方向の下側はそちら向きの確率(1 - probability)で出す。
 * 荒れの下側は要件どおり「平常」にまとめる。
 */
export function buildForecastLabel(
  question: ForecastQuestion,
  view: ProbabilityView | null | undefined
): ForecastLabel {
  if (!view) {
    return { text: FORECAST_UNAVAILABLE, tone: 'none' };
  }

  if (question === 'DIR') {
    if (view.lean === 'UP') {
      return { text: `${FORECAST_TEXT.UP} ${formatPercent(view.probability)}`, tone: 'up' };
    }
    if (view.lean === 'DOWN') {
      return {
        text: `${FORECAST_TEXT.DOWN} ${formatPercent(1 - view.probability)}`,
        tone: 'down',
      };
    }
    return { text: FORECAST_TEXT.NEUTRAL, tone: 'muted' };
  }

  if (view.lean === 'HIGH') {
    return { text: `${FORECAST_TEXT.HIGH} ${formatPercent(view.probability)}`, tone: 'high' };
  }
  return { text: FORECAST_TEXT.CALM, tone: 'muted' };
}

/** 「基準 50%」 */
export function formatBaseline(baseline: number): string {
  return `基準 ${formatPercent(baseline)}`;
}

/** 符号付きで pt 表記にする。マイナスは U+2212 */
function formatSignedPt(pt: number, digits: number): string {
  const rounded = Number(pt.toFixed(digits));
  if (rounded === 0) {
    return `${(0).toFixed(digits)}pt`;
  }
  const body = Math.abs(rounded).toFixed(digits);
  return `${rounded > 0 ? '+' : '−'}${body}pt`;
}

/** 基準値との差(整数 pt)。「+6pt」 */
export function formatDiffFromBaseline(probability: number, baseline: number): string {
  return formatSignedPt((probability - baseline) * 100, 0);
}

/** 軸の寄与(小数 1 桁 pt)。「+2.1pt」「−0.8pt」 */
export function formatContribution(contribution: number): string {
  return formatSignedPt(contribution * 100, 1);
}

/** 「9/25 引け時点」。不正な日付は null */
export function formatReferenceDate(date: string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  return `${Number(match[1])}/${Number(match[2])} 引け時点`;
}

/** 点灯列の表示。「3（買2売1）」 */
export function formatLit(lit: TickerForecastSummary['lit'] | null | undefined): string {
  if (!lit) {
    return FORECAST_UNAVAILABLE;
  }
  if (lit.total === 0) {
    return '0';
  }
  return `${lit.total}（買${lit.buy}売${lit.sell}）`;
}

/** 同じ確率帯の過去実績 1 行 */
export function formatBandHistory(band: BandHistoryView): string {
  const range = `${Math.round(band.lower * 100)}〜${formatPercent(band.upper)}`;
  return `${range} の帯の実績: 的中 ${formatPercent(band.hitRate)}（${band.count} 件）`;
}

export function isBandLowSample(band: BandHistoryView): boolean {
  return band.count < BAND_LOW_SAMPLE_THRESHOLD;
}

/** 内訳テーブルの「値」列 */
export function formatAxisValue(axis: AxisBreakdown): string {
  if (axis.kind === 'FLAG') {
    return axis.lit ? '点灯' : '点灯なし';
  }
  return typeof axis.ratio === 'number'
    ? `${axis.ratio.toFixed(1)} 倍（平常比）`
    : FORECAST_UNAVAILABLE;
}

/** 内訳テーブルの「過去成績」列。「212 件 / 的中 57% / 基準差 +3.0pt」 */
export function formatAxisPerformance(axis: AxisBreakdown): string {
  const { count, hitRate, diffFromBaseline } = axis.performance;
  return `${count} 件 / 的中 ${formatPercent(hitRate)} / 基準差 ${formatSignedPt(diffFromBaseline * 100, 1)}`;
}

/**
 * 点灯型で点灯しなかった軸を折りたたみ側へ分ける。
 * 並び順は API が返した順(寄与の絶対値の降順)を保つ。
 */
export function splitAxes(axes: readonly AxisBreakdown[]): {
  active: AxisBreakdown[];
  inactive: AxisBreakdown[];
} {
  const active: AxisBreakdown[] = [];
  const inactive: AxisBreakdown[] = [];
  for (const axis of axes) {
    if (axis.kind === 'FLAG' && axis.lit !== true) {
      inactive.push(axis);
    } else {
      active.push(axis);
    }
  }
  return { active, inactive };
}

/**
 * 一覧セルの「—」に添えるツールチップ文言。
 * 確度レコード自体がないときと、荒れだけ履歴不足で出せないときを分ける。
 */
export function resolveUnavailableReason(
  question: ForecastQuestion,
  forecast: TickerForecastSummary | null | undefined
): string {
  if (forecast && question === 'VOL') {
    return FORECAST_TEXT.NO_HISTORY;
  }
  return FORECAST_TEXT.NO_FORECAST;
}

/** 詳細の問い 1 件を、一覧と同じ ProbabilityView として扱う */
export function toProbabilityView(
  detail: QuestionDetail | null | undefined
): ProbabilityView | null {
  if (!detail) {
    return null;
  }
  return { probability: detail.probability, baseline: detail.baseline, lean: detail.lean };
}

/** 成績画面へのリンク。開いている問いのタブに対応させる */
export function buildAxisPerformanceHref(question: 'DIR' | 'VOL'): string {
  return `/axis-performance?question=${question}`;
}
