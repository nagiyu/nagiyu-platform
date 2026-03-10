import { STOCK_TRACKER_ERROR_MESSAGES } from '../../lib/error-messages';
import type { TickerSummary } from '../../types/stock';

export const resolveAiAnalysisText = (summary: TickerSummary): string => {
  if (summary.aiAnalysisResult) {
    const signalLabels = {
      BULLISH: '強気',
      NEUTRAL: '中立',
      BEARISH: '弱気',
    } as const;
    const signalLabel = signalLabels[summary.aiAnalysisResult.investmentJudgment.signal];
    return [
      `当日の値動き分析: ${summary.aiAnalysisResult.priceMovementAnalysis}`,
      `パターン分析: ${summary.aiAnalysisResult.patternAnalysis}`,
      `サポートレベル: ${summary.aiAnalysisResult.supportLevels.join(', ')}`,
      `レジスタンスレベル: ${summary.aiAnalysisResult.resistanceLevels.join(', ')}`,
      `関連市場・セクター動向: ${summary.aiAnalysisResult.relatedMarketTrend}`,
      `投資判断: ${signalLabel}`,
      `判断理由: ${summary.aiAnalysisResult.investmentJudgment.reason}`,
    ].join('\n');
  }

  if (typeof summary.aiAnalysisError === 'string') {
    return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_FAILED;
  }

  return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;
};
