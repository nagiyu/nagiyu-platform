import { ERROR_MESSAGES } from '../../lib/error-messages';
import type { TickerSummary } from '../../types/stock';
import type { InvestmentSignal } from '@nagiyu/stock-tracker-core';
import type { ChipColor } from '@nagiyu/ui';

const INVESTMENT_SIGNAL_LABELS: Record<InvestmentSignal, string> = {
  BULLISH: '強気',
  NEUTRAL: '中立',
  BEARISH: '弱気',
} as const;

/** 投資シグナルに対応する Chip カラー */
const INVESTMENT_SIGNAL_COLORS: Record<InvestmentSignal, ChipColor> = {
  BULLISH: 'success',
  NEUTRAL: 'neutral',
  BEARISH: 'danger',
} as const;

export const resolveInvestmentSignalLabel = (signal: InvestmentSignal): string => {
  return INVESTMENT_SIGNAL_LABELS[signal];
};

/**
 * 投資シグナルを Chip コンポーネントの color に変換する純粋関数。
 *
 * BULLISH → success / NEUTRAL → neutral / BEARISH → danger
 */
export const resolveInvestmentSignalColor = (signal: InvestmentSignal): ChipColor => {
  return INVESTMENT_SIGNAL_COLORS[signal];
};

export const resolveAiAnalysisFallbackMessage = (summary: TickerSummary): string | null => {
  if (summary.aiAnalysisResult) {
    return null;
  }
  if (typeof summary.aiAnalysisError === 'string') {
    return ERROR_MESSAGES.AI_ANALYSIS_FAILED;
  }

  return ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED;
};
