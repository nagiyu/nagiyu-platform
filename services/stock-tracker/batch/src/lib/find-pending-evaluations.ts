/**
 * 採点対象の未採点 DailySummary を抽出するヘルパー
 *
 * 取引所ごとに以下を実施する:
 *   1. `getLastTradingDate` でその取引所の直近完了取引日 (L) を求める
 *   2. `getByExchangeAndDateRange` で過去 windowDays 日分の DailySummary を取得（GSI4 Query）
 *   3. メモリ上で「AiAnalysisResult あり & AiAnalysisError なし & EvaluatedAt 未設定」をフィルタ
 *   4. 各 summary の予測日 D に対して翌営業日 (next weekday) を算出し、L 以下なら採点候補とする
 *
 * 採点バッチ本体 (`evaluation.ts`) はここで得た候補を順次採点する。
 */

import {
  countWeekdaysBetween,
  formatDateInTimezone,
  getLastTradingDate,
  getNextWeekday,
} from '@nagiyu/stock-tracker-core';
import type {
  DailySummaryEntity,
  DailySummaryRepository,
  ExchangeEntity,
  ExchangeRepository,
} from '@nagiyu/stock-tracker-core';

/**
 * 採点候補
 */
export interface PendingEvaluation {
  /** 採点対象の DailySummary（予測当日） */
  summary: DailySummaryEntity;
  /** 採点に使う取引所 */
  exchange: ExchangeEntity;
  /** 採点に使う翌営業日 (YYYY-MM-DD) */
  evaluationDate: string;
}

/**
 * `findPendingEvaluations` のオプション
 */
export interface FindPendingEvaluationsOptions {
  /** 取引所ごとに過去何日分の DailySummary を走査するか（デフォルト: 30） */
  windowDays?: number;
}

const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVALUATION_BUSINESS_DAYS = 5;

function shiftDate(dateYmd: string, deltaDays: number): string {
  const base = new Date(`${dateYmd}T00:00:00Z`);
  const shifted = new Date(base.getTime() + deltaDays * DAY_MS);
  return formatDateInTimezone(shifted.getTime(), 'UTC');
}

function isCandidate(summary: DailySummaryEntity, lastTradingDate: string): boolean {
  if (
    summary.AiAnalysisResult === undefined ||
    summary.AiAnalysisError !== undefined ||
    summary.EvaluatedAt !== undefined
  ) {
    return false;
  }
  // 予測日から N 営業日経過しても採点できなければ卒業（祝日連休等で永久未採点になるのを防ぐ）
  const businessDaysElapsed = countWeekdaysBetween(summary.Date, lastTradingDate);
  return businessDaysElapsed < MAX_EVALUATION_BUSINESS_DAYS;
}

/**
 * 採点対象を抽出する
 */
export async function findPendingEvaluations(
  exchangeRepository: ExchangeRepository,
  dailySummaryRepository: DailySummaryRepository,
  now: number,
  options: FindPendingEvaluationsOptions = {}
): Promise<PendingEvaluation[]> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const exchanges = await exchangeRepository.getAll();
  const results: PendingEvaluation[] = [];

  for (const exchange of exchanges) {
    const lastTradingDate = getLastTradingDate(exchange, now);
    const fromDate = shiftDate(lastTradingDate, -windowDays);
    const summaries = await dailySummaryRepository.getByExchangeAndDateRange(
      exchange.ExchangeID,
      fromDate,
      lastTradingDate
    );

    for (const summary of summaries) {
      if (!isCandidate(summary, lastTradingDate)) {
        continue;
      }
      const evaluationDate = getNextWeekday(summary.Date);
      // 翌営業日がまだ閉まっていない場合はスキップ（次回 cron で再評価）
      if (evaluationDate > lastTradingDate) {
        continue;
      }
      results.push({ summary, exchange, evaluationDate });
    }
  }

  return results;
}
