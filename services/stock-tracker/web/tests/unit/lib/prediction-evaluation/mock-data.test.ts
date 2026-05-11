import {
  MOCK_SUMMARY_BY_PERIOD,
  MOCK_TICKERS_BY_PERIOD,
} from '../../../../lib/prediction-evaluation/mock-data';
import { EVALUATION_PERIODS } from '../../../../lib/prediction-evaluation/types';

describe('予測精度 PoC モックデータ', () => {
  describe('MOCK_SUMMARY_BY_PERIOD', () => {
    it('期間ごとに SummaryResponse が定義されている', () => {
      EVALUATION_PERIODS.forEach((period) => {
        const response = MOCK_SUMMARY_BY_PERIOD[period];
        expect(response).toBeDefined();
        expect(response.period).toBe(period);
        expect(typeof response.evaluatedAt).toBe('number');
      });
    });

    it('all 期間は空状態（judgedCount=0、dailyTrend=[]、byExchange=[]）', () => {
      const all = MOCK_SUMMARY_BY_PERIOD['all'];
      expect(all.kpi.judgedCount).toBe(0);
      expect(all.kpi.totalAccuracy).toBeNull();
      expect(all.kpi.directionalAccuracy).toBeNull();
      expect(all.kpi.neutralRatio).toBeNull();
      expect(all.dailyTrend).toEqual([]);
      expect(all.byExchange).toEqual([]);
    });

    it('7d は部分欠損（accuracy=null）を含む', () => {
      const summary = MOCK_SUMMARY_BY_PERIOD['7d'];
      expect(summary.dailyTrend.some((p) => p.directionalAccuracy === null)).toBe(true);
      expect(summary.byExchange.some((e) => e.accuracy === null)).toBe(true);
    });

    it('bySignal は 3 シグナルすべてを含む', () => {
      const summary = MOCK_SUMMARY_BY_PERIOD['7d'];
      const signals = summary.bySignal.map((entry) => entry.signal).sort();
      expect(signals).toEqual(['BEARISH', 'BULLISH', 'NEUTRAL']);
    });

    it('日次推移の各エントリは YYYY-MM-DD 形式の date を持つ', () => {
      EVALUATION_PERIODS.forEach((period) => {
        const summary = MOCK_SUMMARY_BY_PERIOD[period];
        summary.dailyTrend.forEach((point) => {
          expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });
    });

    it('30d / 90d は十分な日数の dailyTrend を持つ', () => {
      expect(MOCK_SUMMARY_BY_PERIOD['30d'].dailyTrend.length).toBeGreaterThanOrEqual(20);
      expect(MOCK_SUMMARY_BY_PERIOD['90d'].dailyTrend.length).toBeGreaterThanOrEqual(60);
    });
  });

  describe('MOCK_TICKERS_BY_PERIOD', () => {
    it('期間ごとに TickersResponse が定義されている', () => {
      EVALUATION_PERIODS.forEach((period) => {
        const response = MOCK_TICKERS_BY_PERIOD[period];
        expect(response).toBeDefined();
        expect(response.period).toBe(period);
        expect(typeof response.minCount).toBe('number');
      });
    });

    it('all 期間は空状態（tickers=[]）', () => {
      expect(MOCK_TICKERS_BY_PERIOD['all'].tickers).toEqual([]);
    });

    it('複数取引所のティッカーを含む', () => {
      const tickers = MOCK_TICKERS_BY_PERIOD['7d'].tickers;
      const exchanges = new Set(tickers.map((t) => t.exchangeId));
      expect(exchanges.size).toBeGreaterThanOrEqual(2);
    });

    it('各ティッカーで bullishHit ≤ bullishTotal、bearishHit ≤ bearishTotal が成り立つ', () => {
      MOCK_TICKERS_BY_PERIOD['90d'].tickers.forEach((ticker) => {
        expect(ticker.bullishHit).toBeLessThanOrEqual(ticker.bullishTotal);
        expect(ticker.bearishHit).toBeLessThanOrEqual(ticker.bearishTotal);
        expect(ticker.count).toBeGreaterThanOrEqual(ticker.bullishTotal + ticker.bearishTotal);
      });
    });
  });
});
