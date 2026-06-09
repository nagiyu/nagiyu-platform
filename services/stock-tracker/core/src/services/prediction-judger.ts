/**
 * Stock Tracker Core - Prediction Judger Service
 *
 * AI 予測（投資判断シグナル）と翌営業日終値リターンから Hit / Miss を判定する純粋関数。
 *
 * Phase 1 仕様:
 * - 入力: 予測シグナル (BULLISH / NEUTRAL / BEARISH)、基準終値、翌営業日終値、閾値 (%)
 * - 出力: 実績リターン (%) と Hit 判定
 *
 * 境界値仕様（design.md §3.4）:
 * - BULLISH: r >= +threshold（以上、境界値を成功に含める）
 * - BEARISH: r <= -threshold（以下、境界値を成功に含める）
 * - NEUTRAL: -threshold < r < +threshold（より大きく / より小さく、境界値は方向側に分類）
 *
 * これにより `r = +0.5` ちょうどは「BULLISH なら成功 / NEUTRAL なら失敗」となり重複しない。
 */

import type { InvestmentSignal } from '../ai-analysis-result.js';

/**
 * エラーメッセージ定数
 */
export const PREDICTION_JUDGER_ERROR_MESSAGES = {
  INVALID_BASE_CLOSE: '無効な基準終値です。基準終値は正の有限な数値である必要があります',
  INVALID_EVALUATION_CLOSE: '無効な採点終値です。採点終値は正の有限な数値である必要があります',
  INVALID_THRESHOLD: '無効な閾値です。閾値は正の有限な数値である必要があります',
  INVALID_SIGNAL: '無効な投資判断シグナルです',
  INVALID_PREDICTED_RETURN: '無効な予測リターンです。予測リターンは有限な数値である必要があります',
} as const;

/**
 * signal 導出に使う既定閾値 (%)
 *
 * 採点側の 0.5% と意味を揃えた共有閾値。
 * predictedReturn がこの閾値以上なら BULLISH、以下（負）なら BEARISH、その間は NEUTRAL。
 */
export const PREDICTION_SIGNAL_THRESHOLD_PERCENT = 0.5;

/**
 * 予測リターン (%) から投資判断シグナルを決定的に導出する純粋関数。
 *
 * 境界値仕様（classifyHit の成功条件と揃える）:
 * - predictedReturn >= +threshold → 'BULLISH'
 * - predictedReturn <= -threshold → 'BEARISH'
 * - それ以外 → 'NEUTRAL'
 *
 * @param predictedReturn - 翌営業日終値の当日比予測リターン (%)。有限数であること
 * @param thresholdPercent - 閾値 (%)。正の有限数であること
 * @returns 導出されたシグナル
 * @throws Error - 入力値が不正な場合
 */
export function deriveSignalFromReturn(
  predictedReturn: number,
  thresholdPercent: number
): InvestmentSignal {
  if (typeof thresholdPercent !== 'number' || !isFinite(thresholdPercent) || thresholdPercent <= 0) {
    throw new Error(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_THRESHOLD);
  }

  if (typeof predictedReturn !== 'number' || !isFinite(predictedReturn)) {
    throw new Error(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_PREDICTED_RETURN);
  }

  if (predictedReturn >= thresholdPercent) {
    return 'BULLISH';
  }
  if (predictedReturn <= -thresholdPercent) {
    return 'BEARISH';
  }
  return 'NEUTRAL';
}

/**
 * `judgePrediction` の入力
 */
export interface JudgeInput {
  /** AI が出した予測シグナル */
  signal: InvestmentSignal;
  /** 予測当日の終値 */
  baseClose: number;
  /** 翌営業日の終値 */
  evaluationClose: number;
  /** Hit 判定に使う閾値 (%)。Phase 1 では 0.5 を渡す */
  thresholdPercent: number;
}

/**
 * `judgePrediction` の出力
 */
export interface JudgeResult {
  /** 実績リターン (%): (evaluationClose - baseClose) / baseClose * 100 */
  actualReturn: number;
  /** Hit / Miss 判定 */
  hit: boolean;
}

/**
 * シグナル・実績リターン・閾値から Hit を返す純粋関数。
 *
 * 境界値仕様（design.md §3.4）:
 * - BULLISH: actualReturn >= threshold（境界値を成功に含める）
 * - BEARISH: actualReturn <= -threshold（境界値を成功に含める）
 * - NEUTRAL: -threshold < actualReturn < +threshold（境界値は方向側に分類）
 *
 * @param signal - 投資判断シグナル
 * @param actualReturn - 実績リターン (%)
 * @param thresholdPercent - Hit 判定閾値 (%)。正の有限数であること
 * @returns Hit 判定
 * @throws Error - signal が不正な場合
 */
export function classifyHit(
  signal: InvestmentSignal,
  actualReturn: number,
  thresholdPercent: number
): boolean {
  switch (signal) {
    case 'BULLISH':
      return actualReturn >= thresholdPercent;
    case 'BEARISH':
      return actualReturn <= -thresholdPercent;
    case 'NEUTRAL':
      return actualReturn > -thresholdPercent && actualReturn < thresholdPercent;
    default: {
      const exhaustive: never = signal;
      throw new Error(`${PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_SIGNAL}: ${String(exhaustive)}`);
    }
  }
}

/**
 * 投資判断シグナルと翌営業日終値リターンから Hit / Miss を判定する。
 *
 * @param input - 判定入力
 * @returns 実績リターンと Hit 判定
 * @throws Error - 入力値が不正な場合
 */
export function judgePrediction(input: JudgeInput): JudgeResult {
  const { signal, baseClose, evaluationClose, thresholdPercent } = input;

  if (typeof baseClose !== 'number' || !isFinite(baseClose) || baseClose <= 0) {
    throw new Error(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_BASE_CLOSE);
  }

  if (typeof evaluationClose !== 'number' || !isFinite(evaluationClose) || evaluationClose <= 0) {
    throw new Error(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_EVALUATION_CLOSE);
  }

  if (
    typeof thresholdPercent !== 'number' ||
    !isFinite(thresholdPercent) ||
    thresholdPercent <= 0
  ) {
    throw new Error(PREDICTION_JUDGER_ERROR_MESSAGES.INVALID_THRESHOLD);
  }

  const actualReturn = ((evaluationClose - baseClose) / baseClose) * 100;

  const hit = classifyHit(signal, actualReturn, thresholdPercent);

  return { actualReturn, hit };
}
