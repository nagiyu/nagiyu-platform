/**
 * Core Web Vitals の基準値定数
 *
 * Google が定める「Good」評価の閾値を定義する。
 * https://web.dev/articles/vitals
 */

/** Core Web Vitals 各指標の上限値（「Good」評価の閾値） */
export const CWV_THRESHOLDS = {
  /** LCP（Largest Contentful Paint）: 2.5 秒以内が Good */
  LCP_GOOD_MS: 2500,
  /** LCP（Largest Contentful Paint）: 4.0 秒を超えると Poor */
  LCP_POOR_MS: 4000,

  /** CLS（Cumulative Layout Shift）: 0.1 以下が Good */
  CLS_GOOD: 0.1,
  /** CLS（Cumulative Layout Shift）: 0.25 を超えると Poor */
  CLS_POOR: 0.25,

  /** INP（Interaction to Next Paint）: 200ms 以内が Good */
  INP_GOOD_MS: 200,
  /** INP（Interaction to Next Paint）: 500ms を超えると Poor */
  INP_POOR_MS: 500,

  /** FCP（First Contentful Paint）: 1.8 秒以内が Good */
  FCP_GOOD_MS: 1800,
  /** FCP（First Contentful Paint）: 3.0 秒を超えると Poor */
  FCP_POOR_MS: 3000,

  /** TTFB（Time to First Byte）: 800ms 以内が Good */
  TTFB_GOOD_MS: 800,
  /** TTFB（Time to First Byte）: 1800ms を超えると Poor */
  TTFB_POOR_MS: 1800,
} as const;

/** Core Web Vitals の評価ラベル */
export type CwvRating = 'good' | 'needs-improvement' | 'poor';

/**
 * LCP 値を評価ラベルに変換する
 * @param ms - LCP ミリ秒
 */
export function rateLcp(ms: number): CwvRating {
  if (ms <= CWV_THRESHOLDS.LCP_GOOD_MS) return 'good';
  if (ms <= CWV_THRESHOLDS.LCP_POOR_MS) return 'needs-improvement';
  return 'poor';
}

/**
 * CLS 値を評価ラベルに変換する
 * @param value - CLS スコア（無次元）
 */
export function rateCls(value: number): CwvRating {
  if (value <= CWV_THRESHOLDS.CLS_GOOD) return 'good';
  if (value <= CWV_THRESHOLDS.CLS_POOR) return 'needs-improvement';
  return 'poor';
}

/**
 * INP 値を評価ラベルに変換する
 * @param ms - INP ミリ秒
 */
export function rateInp(ms: number): CwvRating {
  if (ms <= CWV_THRESHOLDS.INP_GOOD_MS) return 'good';
  if (ms <= CWV_THRESHOLDS.INP_POOR_MS) return 'needs-improvement';
  return 'poor';
}

/**
 * FCP 値を評価ラベルに変換する
 * @param ms - FCP ミリ秒
 */
export function rateFcp(ms: number): CwvRating {
  if (ms <= CWV_THRESHOLDS.FCP_GOOD_MS) return 'good';
  if (ms <= CWV_THRESHOLDS.FCP_POOR_MS) return 'needs-improvement';
  return 'poor';
}

/**
 * TTFB 値を評価ラベルに変換する
 * @param ms - TTFB ミリ秒
 */
export function rateTtfb(ms: number): CwvRating {
  if (ms <= CWV_THRESHOLDS.TTFB_GOOD_MS) return 'good';
  if (ms <= CWV_THRESHOLDS.TTFB_POOR_MS) return 'needs-improvement';
  return 'poor';
}
