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
  LOW_SAMPLE_MARKET: '過去の日数が少ないため参考値',
  LOW_SAMPLE_MARKET_ROW: '(参考値)',
  NEUTRAL: '中立',
  CALM: '平常',
  UP: '強含み',
  DOWN: '弱含み',
  HIGH: '荒れそう',
  USUAL: 'ふだん',
  USUAL_MARKET: 'ふだんの荒れる割合',
  PROBABILITY_DIR: '上回る確率',
  PROBABILITY_VOL: '荒れる確率',
} as const;

/** 帯の実績の件数がこの値未満なら参考値扱いにする */
export const BAND_LOW_SAMPLE_THRESHOLD = 30;

/** ラベルの色調。中立・平常は控えめな色にする */
export type ForecastTone = 'up' | 'down' | 'high' | 'muted' | 'none';

export interface ForecastLabel {
  /** 「強含み」「中立」「—」など。確率は含めない */
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
 * 文字だけを返し、確率は含めない。方向の弱含みに「下回る確率」を添えると、
 * 隣に並ぶ「上回る確率」と食い違って見えるため、確率は別の表示に分ける。
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
      return { text: FORECAST_TEXT.UP, tone: 'up' };
    }
    if (view.lean === 'DOWN') {
      return { text: FORECAST_TEXT.DOWN, tone: 'down' };
    }
    return { text: FORECAST_TEXT.NEUTRAL, tone: 'muted' };
  }

  if (view.lean === 'HIGH') {
    return { text: FORECAST_TEXT.HIGH, tone: 'high' };
  }
  return { text: FORECAST_TEXT.CALM, tone: 'muted' };
}

/**
 * 確率の見出し。方向は P(市場平均を上回る) をそのまま出し、
 * 下側でも 1 - p に置き換えない。
 */
export function formatProbability(question: ForecastQuestion, probability: number): string {
  const title = question === 'DIR' ? FORECAST_TEXT.PROBABILITY_DIR : FORECAST_TEXT.PROBABILITY_VOL;
  return `${title} ${formatPercent(probability)}`;
}

/** 「ふだん 37%」 */
export function formatUsualRate(baseline: number): string {
  return `${FORECAST_TEXT.USUAL} ${formatPercent(baseline)}`;
}

/** 「荒れる確率 23% (ふだん 37%)」 */
export function formatProbabilityWithUsual(
  question: ForecastQuestion,
  view: Pick<ProbabilityView, 'probability' | 'baseline'>
): string {
  return `${formatProbability(question, view.probability)} (${formatUsualRate(view.baseline)})`;
}

/** 軸の寄与(小数 1 桁 pt)。「+2.1pt」「−0.8pt」 */
export function formatContribution(contribution: number): string {
  return formatSignedPt(contribution * 100, 1);
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

/** 市場の荒れ予報 1 件分。forecast が無い市場は null */
export type MarketForecastView = (ProbabilityView & { lowSample: boolean }) | null;

export interface MarketForecastNotes {
  /** 全市場で同じ「ふだん」の値。共通行に 1 回だけ出す。値が違うときは null */
  sharedBaseline: number | null;
  /** 全市場が参考値のとき true。共通行に 1 回だけ出す */
  sharedLowSample: boolean;
  /** 各行に「(ふだん NN%)」を付けるか */
  baselinePerRow: boolean;
  /** 各行に「(参考値)」を付けるか */
  lowSamplePerRow: boolean;
}

/**
 * 市場の荒れ予報の共通情報の置き場所を決める。
 * ふだんの割合は仕様上 JP・US で同じだが、違う値が来たときは共通行だと
 * どちらかを隠してしまうため、各行に出す。
 */
export function resolveMarketNotes(forecasts: readonly MarketForecastView[]): MarketForecastNotes {
  const present = forecasts.filter((forecast): forecast is NonNullable<MarketForecastView> =>
    Boolean(forecast)
  );
  if (present.length === 0) {
    return {
      sharedBaseline: null,
      sharedLowSample: false,
      baselinePerRow: false,
      lowSamplePerRow: false,
    };
  }
  const first = present[0].baseline;
  const sameBaseline = present.every((forecast) => forecast.baseline === first);
  const lowCount = present.filter((forecast) => forecast.lowSample).length;
  return {
    sharedBaseline: sameBaseline ? first : null,
    sharedLowSample: lowCount === present.length,
    baselinePerRow: !sameBaseline,
    lowSamplePerRow: lowCount > 0 && lowCount < present.length,
  };
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

/** 点灯列の表示部品。合計を固定幅で並べるため、合計と内訳を分けて返す */
export interface LitParts {
  /** 合計。点灯情報がないときは「—」 */
  total: string;
  /** 「（買2売1）」。合計が 0 のときと情報がないときは null */
  breakdown: string | null;
}

export function buildLitParts(lit: TickerForecastSummary['lit'] | null | undefined): LitParts {
  if (!lit) {
    return { total: FORECAST_UNAVAILABLE, breakdown: null };
  }
  if (lit.total === 0) {
    return { total: '0', breakdown: null };
  }
  return { total: `${lit.total}`, breakdown: `（買${lit.buy}売${lit.sell}）` };
}

/** 点灯列の表示。「3（買2売1）」 */
export function formatLit(lit: TickerForecastSummary['lit'] | null | undefined): string {
  const { total, breakdown } = buildLitParts(lit);
  return `${total}${breakdown ?? ''}`;
}

/**
 * 一覧のラベル枠の幅(rem)。その問いで最も長いラベルが収まる幅にして、
 * 後ろの確率の開始位置を行ごとにそろえる。
 */
export function resolveLabelSlotWidthRem(question: ForecastQuestion): number {
  const labels =
    question === 'DIR'
      ? [FORECAST_TEXT.NEUTRAL, FORECAST_TEXT.UP, FORECAST_TEXT.DOWN]
      : [FORECAST_TEXT.CALM, FORECAST_TEXT.HIGH];
  const longest = Math.max(...labels.map((label) => label.length));
  // チップの文字幅(約 0.85rem/字)と左右の内側余白の分
  return Math.ceil(longest * 0.85 + 1.75);
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

/** 内訳テーブルの「過去成績」列。「212 件 / 的中 57% / ふだんとの差 +3.0pt」 */
export function formatAxisPerformance(axis: AxisBreakdown): string {
  const { count, hitRate, diffFromBaseline } = axis.performance;
  return `${count} 件 / 的中 ${formatPercent(hitRate)} / ふだんとの差 ${formatSignedPt(diffFromBaseline * 100, 1)}`;
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
