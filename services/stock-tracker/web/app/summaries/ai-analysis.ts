import { STOCK_TRACKER_ERROR_MESSAGES } from '../../lib/error-messages';
import type { TickerSummary } from '../../types/stock';
import type { InvestmentSignal } from '@nagiyu/stock-tracker-core';

const INVESTMENT_SIGNAL_LABELS: Record<InvestmentSignal, string> = {
  BULLISH: '強気',
  NEUTRAL: '中立',
  BEARISH: '弱気',
} as const;

export const resolveInvestmentSignalLabel = (signal: InvestmentSignal): string => {
  return INVESTMENT_SIGNAL_LABELS[signal];
};

export const resolveAiAnalysisFallbackMessage = (summary: TickerSummary): string | null => {
  if (summary.aiAnalysisResult) {
    return null;
  }
  if (typeof summary.aiAnalysisError === 'string') {
    return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_FAILED;
  }

  return STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;
};
