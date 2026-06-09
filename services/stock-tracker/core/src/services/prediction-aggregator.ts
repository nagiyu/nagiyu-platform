/**
 * Stock Tracker Core - Prediction Aggregator Service
 *
 * 採点済み DailySummary の配列から、予測精度ダッシュボード用の集計値を算出する純粋関数。
 *
 * Phase 1 仕様（design.md §3.3、external-design.md ADR-003〜005）:
 * - KPI: 総合精度 / 方向精度（BULLISH+BEARISH のみ） / 判定済み件数
 * - bySignal: シグナル別の的中率と件数（BULLISH / NEUTRAL / BEARISH の 3 種類を常に返す）
 * - dailyTrend: 予測日 (DailySummary.Date) でグルーピングした方向精度推移
 *
 * 入力は採点済み（Evaluation* 全埋まり、AiAnalysisResult あり、AiAnalysisError なし）に
 * 絞った配列を渡す前提だが、防御的に AiAnalysisError ありや AiAnalysisResult 不在は除外する。
 *
 * 空入力時は `accuracy = null`、`count = 0` を返す。
 */

import type { DailySummaryEntity } from '../entities/daily-summary.entity.js';
import type { AiAnalysisResult, InvestmentSignal } from '../ai-analysis-result.js';
import { classifyHit } from './prediction-judger.js';

/**
 * 採点済み DailySummary 型（Evaluation* と AiAnalysisResult が埋まっていることを保証）
 *
 * `AggregateInput.evaluated` は呼び出し側でこの型に絞ってから渡す前提。
 */
export type EvaluatedDailySummary = DailySummaryEntity & {
  EvaluationDate: string;
  EvaluationClose: number;
  ActualReturn: number;
  Hit: boolean;
  EvaluationThresholdPercent: number;
  EvaluatedAt: number;
  AiAnalysisResult: AiAnalysisResult;
};

/**
 * 集計入力
 */
export interface AggregateInput {
  evaluated: EvaluatedDailySummary[];
  /**
   * Hit 再計算に使う閾値 (%)。省略時は 0.5（後方互換）。
   * 保存済みの `Hit` フィールドは使用せず、`ActualReturn` から再計算する。
   */
  thresholdPercent?: number;
}

/**
 * 集計出力（SummaryResponse の kpi / bySignal / dailyTrend と一致）
 */
export interface AggregateOutput {
  kpi: {
    /** 総合精度（%）。判定済み 0 件なら null */
    totalAccuracy: number | null;
    /** 方向精度（%、BULLISH + BEARISH のみ）。0 件なら null */
    directionalAccuracy: number | null;
    /** 判定済み件数 */
    judgedCount: number;
  };
  bySignal: Array<{
    signal: InvestmentSignal;
    accuracy: number | null;
    count: number;
  }>;
  dailyTrend: Array<{
    /** 予測日 (YYYY-MM-DD) */
    date: string;
    /** その日の方向精度（BULLISH + BEARISH のみ）。0 件なら null */
    directionalAccuracy: number | null;
    /** その日の判定済み件数（NEUTRAL を含む） */
    judgedCount: number;
  }>;
  /** 集計に使用した閾値 (%) */
  thresholdPercent: number;
}

/**
 * bySignal の出力順序。常にこの順で 3 件返す（count=0 でも省略しない）
 */
const SIGNAL_ORDER: readonly InvestmentSignal[] = ['BULLISH', 'NEUTRAL', 'BEARISH'];

/** Hit 再計算に使うデフォルト閾値 (%) */
const DEFAULT_THRESHOLD_PERCENT = 0.5;

/**
 * 採点済み DailySummary 配列を集計する。
 *
 * 保存済みの `Hit` フィールドは使用せず、`ActualReturn` と `thresholdPercent` から
 * `classifyHit` で Hit を再計算する。`thresholdPercent` 省略時は 0.5（後方互換）。
 *
 * @param input - 集計入力
 * @returns KPI / bySignal / dailyTrend / thresholdPercent を含む集計結果
 */
export function aggregateEvaluatedSummaries(input: AggregateInput): AggregateOutput {
  const thresholdPercent = input.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT;

  // 防御的フィルタ：AiAnalysisError ありや AiAnalysisResult 不在を除外
  const evaluated = input.evaluated.filter(
    (summary) => summary.AiAnalysisResult !== undefined && summary.AiAnalysisError === undefined
  );

  const judgedCount = evaluated.length;

  // KPI: totalAccuracy
  const totalAccuracy =
    judgedCount === 0 ? null : toPercent(countHits(evaluated, thresholdPercent), judgedCount);

  // KPI: directionalAccuracy
  const directional = evaluated.filter(
    (summary) =>
      summary.AiAnalysisResult.investmentJudgment.signal === 'BULLISH' ||
      summary.AiAnalysisResult.investmentJudgment.signal === 'BEARISH'
  );
  const directionalAccuracy =
    directional.length === 0
      ? null
      : toPercent(countHits(directional, thresholdPercent), directional.length);

  // bySignal
  const bySignal = SIGNAL_ORDER.map((signal) => {
    const subset = evaluated.filter(
      (summary) => summary.AiAnalysisResult.investmentJudgment.signal === signal
    );
    return {
      signal,
      accuracy:
        subset.length === 0 ? null : toPercent(countHits(subset, thresholdPercent), subset.length),
      count: subset.length,
    };
  });

  // dailyTrend: 予測日 (DailySummary.Date) でグルーピング
  const byDate = new Map<string, EvaluatedDailySummary[]>();
  for (const summary of evaluated) {
    const list = byDate.get(summary.Date);
    if (list === undefined) {
      byDate.set(summary.Date, [summary]);
    } else {
      list.push(summary);
    }
  }

  const dailyTrend = Array.from(byDate.entries())
    .map(([date, list]) => {
      const directionalSubset = list.filter(
        (summary) =>
          summary.AiAnalysisResult.investmentJudgment.signal === 'BULLISH' ||
          summary.AiAnalysisResult.investmentJudgment.signal === 'BEARISH'
      );
      return {
        date,
        directionalAccuracy:
          directionalSubset.length === 0
            ? null
            : toPercent(
                countHits(directionalSubset, thresholdPercent),
                directionalSubset.length
              ),
        judgedCount: list.length,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    kpi: {
      totalAccuracy,
      directionalAccuracy,
      judgedCount,
    },
    bySignal,
    dailyTrend,
    thresholdPercent,
  };
}

/**
 * `classifyHit` を使って Hit 数を数える。
 * 保存済みの `Hit` フィールドは参照しない。
 */
function countHits(summaries: EvaluatedDailySummary[], thresholdPercent: number): number {
  return summaries.reduce(
    (acc, summary) =>
      acc +
      (classifyHit(
        summary.AiAnalysisResult.investmentJudgment.signal,
        summary.ActualReturn,
        thresholdPercent
      )
        ? 1
        : 0),
    0
  );
}

/**
 * 的中数と全体件数からパーセント値を算出し、小数第 1 位に丸める。
 *
 * @param hits - 的中件数
 * @param total - 全体件数（必ず 1 以上であること）
 */
function toPercent(hits: number, total: number): number {
  return Math.round((hits / total) * 1000) / 10;
}
