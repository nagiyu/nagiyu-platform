/**
 * Stock Tracker Core - Candle Pattern Analyzer
 *
 * 日足ローソク足パターンを分析し、買い/売りシグナルを検出する
 */

import type { ChartDataPoint } from '../types.js';

/**
 * パターン分析結果
 */
export interface PatternResult {
  /** パターンID */
  id: string;
  /** パターン名 */
  name: string;
  /** パターン説明 */
  description: string;
  /** パターン種類: Buy（買いシグナル）または Sell（売りシグナル）*/
  type: 'Buy' | 'Sell';
  /** パターンが検出されたか */
  detected: boolean;
}

/**
 * 大陽線・大陰線と判定する最小ボディサイズの比率（始値比）
 */
const LARGE_BODY_THRESHOLD = 0.01;

/**
 * 小さなボディ（星）と判定する最大ボディサイズの比率（始値比）
 */
const SMALL_BODY_THRESHOLD = 0.005;

/**
 * ローソク足のボディサイズを返す
 */
function bodySize(candle: ChartDataPoint): number {
  return Math.abs(candle.close - candle.open);
}

/**
 * 大陰線かどうかを判定する
 */
function isBearishLarge(candle: ChartDataPoint): boolean {
  if (candle.open <= 0) return false;
  return candle.close < candle.open && bodySize(candle) / candle.open >= LARGE_BODY_THRESHOLD;
}

/**
 * 大陽線かどうかを判定する
 */
function isBullishLarge(candle: ChartDataPoint): boolean {
  if (candle.open <= 0) return false;
  return candle.close > candle.open && bodySize(candle) / candle.open >= LARGE_BODY_THRESHOLD;
}

/**
 * 小さなボディ（星）かどうかを判定する
 */
function isSmallBody(candle: ChartDataPoint): boolean {
  const maxPrice = Math.max(candle.open, candle.close);
  if (maxPrice <= 0) return false;
  return bodySize(candle) / maxPrice < SMALL_BODY_THRESHOLD;
}

/**
 * 三川明けの明星を検出する
 *
 * data 配列は最新順（data[0] = 最新）
 * 3本のローソク足パターン:
 * - data[2]: 大陰線（下降トレンド）
 * - data[1]: 小さなボディ（星）
 * - data[0]: 大陽線（data[2] の実体中央より上で終値）
 */
export function detectMorningStar(data: ChartDataPoint[]): boolean {
  if (data.length < 3) return false;

  const candle1 = data[2]; // 最も古い足（第1本目）
  const candle2 = data[1]; // 中間の足（星）
  const candle3 = data[0]; // 最新の足（第3本目）

  const midpoint1 = (candle1.open + candle1.close) / 2;

  return (
    isBearishLarge(candle1) &&
    isSmallBody(candle2) &&
    isBullishLarge(candle3) &&
    candle3.close >= midpoint1
  );
}

/**
 * 三川宵の明星を検出する
 *
 * data 配列は最新順（data[0] = 最新）
 * 3本のローソク足パターン:
 * - data[2]: 大陽線（上昇トレンド）
 * - data[1]: 小さなボディ（星）
 * - data[0]: 大陰線（data[2] の実体中央より下で終値）
 */
export function detectEveningStar(data: ChartDataPoint[]): boolean {
  if (data.length < 3) return false;

  const candle1 = data[2]; // 最も古い足（第1本目）
  const candle2 = data[1]; // 中間の足（星）
  const candle3 = data[0]; // 最新の足（第3本目）

  const midpoint1 = (candle1.open + candle1.close) / 2;

  return (
    isBullishLarge(candle1) &&
    isSmallBody(candle2) &&
    isBearishLarge(candle3) &&
    candle3.close <= midpoint1
  );
}

/**
 * システム定義パターン一覧
 */
export const PATTERN_DEFINITIONS = [
  {
    id: 'morning-star',
    name: '三川明けの明星',
    description:
      '下降トレンドの底で発生する3本足の強気反転パターン。大陰線・星・大陽線の順に出現し、相場の底打ちを示唆します。',
    type: 'Buy' as const,
    detect: detectMorningStar,
  },
  {
    id: 'evening-star',
    name: '三川宵の明星',
    description:
      '上昇トレンドの天井で発生する3本足の弱気反転パターン。大陽線・星・大陰線の順に出現し、相場の天井打ちを示唆します。',
    type: 'Sell' as const,
    detect: detectEveningStar,
  },
] as const;

/**
 * チャートデータに対してすべてのパターン分析を実行する
 *
 * @param data - チャートデータ（最新順、50本推奨）
 * @returns パターン分析結果の配列
 */
export function analyzePatterns(data: ChartDataPoint[]): PatternResult[] {
  return PATTERN_DEFINITIONS.map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    type: pattern.type,
    detected: pattern.detect(data),
  }));
}
