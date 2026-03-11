export type InvestmentSignal = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export interface AiAnalysisResult {
  priceMovementAnalysis: string;
  patternAnalysis: string;
  supportLevels: [number, number, number];
  resistanceLevels: [number, number, number];
  relatedMarketTrend: string;
  investmentJudgment: {
    signal: InvestmentSignal;
    reason: string;
  };
}
