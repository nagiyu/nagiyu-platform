export type InvestmentSignal = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export interface AiAnalysisResult {
  priceMovementAnalysis: string;
  patternAnalysis: string;
  supportLevels: [number, number, number];
  resistanceLevels: [number, number, number];
  relatedMarketTrend: string;
  investmentJudgment: {
    signal: InvestmentSignal;
    /** 予測リターン (%): 翌営業日終値の当日終値比。signal はこの値から閾値で導出される */
    predictedReturn?: number;
    /** 確信度 (0〜1)。1 が最も確信が高い */
    confidence?: number;
    reason: string;
  };
}
