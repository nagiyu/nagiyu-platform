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
    /** NEUTRAL 予測比率（%）。judgedCount=0 なら null */
    neutralRatio: number | null;
  };
  bySignal: Array<{
    signal: InvestmentSignal;
    accuracy: number | null;
    count: number;
    /**
     * 市場ベースレート（%）。
     * BULLISH→上昇率、BEARISH→下落率、NEUTRAL→フラット率。
     * n=0 なら null。
     */
    baseline: number | null;
    /**
     * エッジ（精度 − ベースライン、%）。
     * accuracy と baseline が両方 non-null のとき算出。どちらか null なら null。
     * 表示用の丸め済み値から計算する。
     */
    edge: number | null;
  }>;
  dailyTrend: Array<{
    /** 予測日 (YYYY-MM-DD) */
    date: string;
    /** その日の方向精度（BULLISH + BEARISH のみ）。0 件なら null */
    directionalAccuracy: number | null;
    /** その日の判定済み件数（NEUTRAL を含む） */
    judgedCount: number;
  }>;
  /**
   * 市場ベースレート（全件を母数）。
   * n=0 なら 3 つとも null。
   */
  baseline: {
    /** 上昇率（ActualReturn >= +thresholdPercent の割合）(%) */
    upRate: number | null;
    /** 下落率（ActualReturn <= -thresholdPercent の割合）(%) */
    downRate: number | null;
    /** フラット率（-thresholdPercent < ActualReturn < +thresholdPercent の割合）(%) */
    flatRate: number | null;
  };
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

  // KPI: neutralRatio（NEUTRAL 予測件数 / 全判定済み件数）
  const neutralCount = evaluated.filter(
    (summary) => summary.AiAnalysisResult.investmentJudgment.signal === 'NEUTRAL'
  ).length;
  const neutralRatio = judgedCount === 0 ? null : toPercent(neutralCount, judgedCount);

  // ベースライン：全件を母数とした市場の上昇/下落/フラット率
  const baseline = computeBaseline(evaluated, thresholdPercent);

  // bySignal
  const bySignal = SIGNAL_ORDER.map((signal) => {
    const subset = evaluated.filter(
      (summary) => summary.AiAnalysisResult.investmentJudgment.signal === signal
    );
    const accuracy =
      subset.length === 0 ? null : toPercent(countHits(subset, thresholdPercent), subset.length);

    // シグナルに対応する市場ベースレートを対応づける
    const signalBaseline =
      signal === 'BULLISH'
        ? baseline.upRate
        : signal === 'BEARISH'
          ? baseline.downRate
          : baseline.flatRate;

    // エッジ = 丸め済み accuracy − 丸め済み baseline（表示値と一致させるため）
    const edge =
      accuracy !== null && signalBaseline !== null
        ? Math.round((accuracy - signalBaseline) * 10) / 10
        : null;

    return {
      signal,
      accuracy,
      count: subset.length,
      baseline: signalBaseline,
      edge,
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
            : toPercent(countHits(directionalSubset, thresholdPercent), directionalSubset.length),
        judgedCount: list.length,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    kpi: {
      totalAccuracy,
      directionalAccuracy,
      judgedCount,
      neutralRatio,
    },
    bySignal,
    dailyTrend,
    baseline,
    thresholdPercent,
  };
}

/**
 * 全採点済みレコードを母数として、市場ベースレート（上昇/下落/フラット率）を算出する。
 *
 * 境界値仕様は `classifyHit` に準拠:
 * - 上昇: ActualReturn >= +thresholdPercent
 * - 下落: ActualReturn <= -thresholdPercent
 * - フラット: -thresholdPercent < ActualReturn < +thresholdPercent
 *
 * @param summaries - フィルタ済み採点済みサマリー配列
 * @param thresholdPercent - 判定閾値 (%)
 * @returns 上昇/下落/フラット率（n=0 なら全て null）
 */
function computeBaseline(
  summaries: EvaluatedDailySummary[],
  thresholdPercent: number
): AggregateOutput['baseline'] {
  const n = summaries.length;
  if (n === 0) {
    return { upRate: null, downRate: null, flatRate: null };
  }

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;

  for (const summary of summaries) {
    const r = summary.ActualReturn;
    if (r >= thresholdPercent) {
      upCount++;
    } else if (r <= -thresholdPercent) {
      downCount++;
    } else {
      flatCount++;
    }
  }

  return {
    upRate: toPercent(upCount, n),
    downRate: toPercent(downCount, n),
    flatRate: toPercent(flatCount, n),
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
