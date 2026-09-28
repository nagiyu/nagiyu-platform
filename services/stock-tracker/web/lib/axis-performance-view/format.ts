import type {
  AxisPerformanceAxis,
  AxisPerformanceResponse,
  ForecastQuestion,
  NeutralBandView,
} from '../../types/forecast';
import { NEUTRAL_BAND_SENTINEL, QUESTION_LABELS, QUESTION_MEANINGS } from './constants';

export const NOT_AVAILABLE = '—';

export const KIND_LABELS = { FLAG: '点灯型', NUMERIC: '数値型' } as const;

/** 0〜1 の率を % 表記にする */
export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** 符号を必ず付ける。負は数学のマイナス記号で表す */
function withSign(value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits);
  // 丸めた結果が 0 のときに負号を付けない
  if (Number(fixed) === 0) return `+${fixed}`;
  return `${value > 0 ? '+' : '−'}${fixed}`;
}

/** 率の差を符号付き pt で表す（0.021 → +2.1pt） */
export function formatSignedPt(diff: number, digits = 1): string {
  return `${withSign(diff * 100, digits)}pt`;
}

/** 平均超過リターンを符号付き % で表す（0.003 → +0.30%） */
export function formatSignedPercent(rate: number, digits = 2): string {
  return `${withSign(rate * 100, digits)}%`;
}

/** 重み（係数）を符号付きで表す */
export function formatWeight(weight: number): string {
  return withSign(weight, 2);
}

export function formatCount(count: number): string {
  return count.toLocaleString('ja-JP');
}

/** 見出し行（「採点済み 8,120 件 ／ 基準 50.3%」） */
export function buildHeadline(
  response: Pick<AxisPerformanceResponse, 'evaluatedCount' | 'hitRate'>
): string {
  return `採点済み ${formatCount(response.evaluatedCount)} 件 ／ 基準 ${formatPercent(response.hitRate)}`;
}

/** 集計対象の予測日の範囲。データなしは null */
export function buildRangeText(from: string | null, to: string | null): string | null {
  return from && to ? `${from}〜${to} (予測日)` : null;
}

/**
 * 中立帯の文言（「基準値 +0〜+5pt は中立」）。
 * 番兵値の側は寄りなしを意味するため、その側の境界を出さず「下側なし」「上側なし」を添える。
 */
export function buildNeutralBandText(band: NeutralBandView | null): string | null {
  if (!band) return null;
  const noLower = band.lower <= NEUTRAL_BAND_SENTINEL.lower;
  const noUpper = band.upper >= NEUTRAL_BAND_SENTINEL.upper;
  const lower = withSign(band.lower * 100, 0);
  const upper = withSign(band.upper * 100, 0);

  if (noLower && noUpper) {
    return '基準値からどれだけ離れても中立 (下側なし・上側なし)';
  }
  if (noLower) return `基準値 ${upper}pt 未満は中立 (下側なし)`;
  if (noUpper) return `基準値 ${lower}pt 以上は中立 (上側なし)`;
  return `基準値 ${lower}〜${upper}pt は中立`;
}

/** 確率帯の見出し（0.45, 0.5 → 45〜50%） */
export function buildBandLabel(lower: number, upper: number): string {
  return `${Math.round(lower * 100)}〜${Math.round(upper * 100)}%`;
}

/** 軸名クリックで出す説明。定義は軸名・種類・対象の問いから組み立てる */
export function buildAxisDescription(
  axis: Pick<AxisPerformanceAxis, 'name' | 'kind'>,
  question: ForecastQuestion
): string {
  const definition =
    axis.kind === 'FLAG'
      ? `「${axis.name}」が点灯した予測の的中率を集計します。`
      : `「${axis.name}」が平常より高かった予測の的中率を集計します。`;
  return `${definition}対象の問い: ${QUESTION_LABELS[question]} (${QUESTION_MEANINGS[question]})`;
}
