import { STOCK_TRACKER_ERROR_MESSAGES } from '../../lib/error-messages';
import type { TickerSummary } from '../../types/stock';

export const resolveAiAnalysisText = (summary: TickerSummary): string => {
  if (typeof summary.aiAnalysis === 'string') {
    return summary.aiAnalysis;
  }

  if (typeof summary.aiAnalysisError === 'string') {
    return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_FAILED;
  }

  return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;
};
