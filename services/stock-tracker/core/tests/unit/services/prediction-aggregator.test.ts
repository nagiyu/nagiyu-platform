/**
 * Stock Tracker Core - Prediction Aggregator Service Unit Tests
 *
 * 集計ロジックのユニットテスト。空入力 / 全 Hit / 全 Miss / 複数取引所 / 複数銘柄 /
 * AiAnalysisError 混在のバリエーションをカバーする。
 */

import {
  aggregateEvaluatedSummaries,
  type EvaluatedDailySummary,
} from '../../../src/services/prediction-aggregator.js';
import type { InvestmentSignal } from '../../../src/ai-analysis-result.js';

/**
 * テスト用の採点済み DailySummary を生成するヘルパ。
 * 不要な既存フィールドはデフォルト値で埋める。
 */
const makeEvaluated = (overrides: {
  tickerId?: string;
  exchangeId?: string;
  date: string;
  signal: InvestmentSignal;
  hit: boolean;
  actualReturn?: number;
}): EvaluatedDailySummary => ({
  TickerID: overrides.tickerId ?? 'TICKER1',
  ExchangeID: overrides.exchangeId ?? 'EX1',
  Date: overrides.date,
  Open: 100,
  High: 105,
  Low: 95,
  Close: 100,
  EvaluationDate: '2026-05-12',
  EvaluationClose: 101,
  ActualReturn: overrides.actualReturn ?? (overrides.hit ? 1.0 : 0.0),
  Hit: overrides.hit,
  EvaluationThresholdPercent: 0.5,
  EvaluatedAt: 1_715_000_000_000,
  AiAnalysisResult: {
    priceMovementAnalysis: 'dummy',
    patternAnalysis: 'dummy',
    supportLevels: [90, 88, 85],
    resistanceLevels: [110, 113, 115],
    relatedMarketTrend: 'dummy',
    investmentJudgment: {
      signal: overrides.signal,
      reason: 'dummy',
    },
  },
  CreatedAt: 1_715_000_000_000,
  UpdatedAt: 1_715_000_000_000,
});

describe('Prediction Aggregator Service', () => {
  describe('aggregateEvaluatedSummaries - 空入力', () => {
    it('入力が空配列のとき、KPI は null / 0、dailyTrend は空、bySignal は 3 シグナル分の 0 件エントリ', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });

      expect(result.kpi).toEqual({
        totalAccuracy: null,
        directionalAccuracy: null,
        judgedCount: 0,
      });
      expect(result.dailyTrend).toEqual([]);
      expect(result.bySignal).toEqual([
        { signal: 'BULLISH', accuracy: null, count: 0 },
        { signal: 'NEUTRAL', accuracy: null, count: 0 },
        { signal: 'BEARISH', accuracy: null, count: 0 },
      ]);
    });
  });

  describe('aggregateEvaluatedSummaries - 全 Hit', () => {
    it('すべて Hit のとき、totalAccuracy と directionalAccuracy が 100', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
        ],
      });

      expect(result.kpi.totalAccuracy).toBe(100);
      expect(result.kpi.directionalAccuracy).toBe(100);
      expect(result.kpi.judgedCount).toBe(3);
    });
  });

  describe('aggregateEvaluatedSummaries - 全 Miss', () => {
    it('すべて Miss のとき、totalAccuracy と directionalAccuracy が 0', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: false }),
        ],
      });

      expect(result.kpi.totalAccuracy).toBe(0);
      expect(result.kpi.directionalAccuracy).toBe(0);
      expect(result.kpi.judgedCount).toBe(3);
    });
  });

  describe('aggregateEvaluatedSummaries - 混在', () => {
    it('混在の場合、的中率を小数第 1 位に丸めて返す', () => {
      // BULLISH: 2 Hit / 3 = 66.666...% → 66.7
      // BEARISH: 1 Hit / 2 = 50.0%
      // NEUTRAL: 0 Hit / 1 = 0.0%
      // 全体: 3 / 6 = 50.0%
      // directional: 3 / 5 = 60.0%
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: false }),
        ],
      });

      expect(result.kpi.totalAccuracy).toBe(50);
      expect(result.kpi.directionalAccuracy).toBe(60);
      expect(result.kpi.judgedCount).toBe(6);

      expect(result.bySignal).toEqual([
        { signal: 'BULLISH', accuracy: 66.7, count: 3 },
        { signal: 'NEUTRAL', accuracy: 0, count: 1 },
        { signal: 'BEARISH', accuracy: 50, count: 2 },
      ]);
    });
  });

  describe('aggregateEvaluatedSummaries - directionalAccuracy（BULLISH+BEARISH のみ）', () => {
    it('NEUTRAL しかない場合、directionalAccuracy は null', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: false }),
        ],
      });

      expect(result.kpi.totalAccuracy).toBe(50);
      expect(result.kpi.directionalAccuracy).toBeNull();
      expect(result.kpi.judgedCount).toBe(2);
    });

    it('BULLISH+BEARISH のみで計算し、NEUTRAL は除外する', () => {
      // BULLISH 1 Hit + BEARISH 1 Miss + NEUTRAL 1 Hit
      // directional = 1 / 2 = 50%
      // total = 2 / 3 ≈ 66.7%
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
        ],
      });

      expect(result.kpi.totalAccuracy).toBe(66.7);
      expect(result.kpi.directionalAccuracy).toBe(50);
    });
  });

  describe('aggregateEvaluatedSummaries - dailyTrend', () => {
    it('予測日 (DailySummary.Date) でグルーピングし、日付昇順で返す', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-08', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-09', signal: 'BULLISH', hit: false }),
          makeEvaluated({ date: '2026-05-09', signal: 'BEARISH', hit: true }),
          // わざと逆順で渡す → 出力は昇順になるはず
          makeEvaluated({ date: '2026-05-07', signal: 'BEARISH', hit: true }),
        ],
      });

      expect(result.dailyTrend.map((p) => p.date)).toEqual([
        '2026-05-07',
        '2026-05-08',
        '2026-05-09',
      ]);

      const day9 = result.dailyTrend.find((p) => p.date === '2026-05-09');
      expect(day9).toEqual({
        date: '2026-05-09',
        directionalAccuracy: 50, // 1 Hit / 2
        judgedCount: 2,
      });
    });

    it('NEUTRAL しかない日は directionalAccuracy = null、judgedCount > 0', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: false }),
        ],
      });

      expect(result.dailyTrend).toEqual([
        {
          date: '2026-05-10',
          directionalAccuracy: null,
          judgedCount: 2,
        },
      ]);
    });

    it('予測がない日のエントリは含まない（連続性を保証しない）', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-08', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
        ],
      });

      expect(result.dailyTrend).toHaveLength(2);
      expect(result.dailyTrend.map((p) => p.date)).toEqual(['2026-05-08', '2026-05-10']);
    });
  });

  describe('aggregateEvaluatedSummaries - 複数取引所 / 複数銘柄', () => {
    it('取引所横断でも合算され、シグナル別 / 日次推移が一意の集計を返す', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          // 同じ日に取引所 A の 2 銘柄
          makeEvaluated({
            date: '2026-05-10',
            exchangeId: 'TSE',
            tickerId: 'A1',
            signal: 'BULLISH',
            hit: true,
          }),
          makeEvaluated({
            date: '2026-05-10',
            exchangeId: 'TSE',
            tickerId: 'A2',
            signal: 'BEARISH',
            hit: false,
          }),
          // 同じ日に取引所 B の 1 銘柄
          makeEvaluated({
            date: '2026-05-10',
            exchangeId: 'NYSE',
            tickerId: 'B1',
            signal: 'BULLISH',
            hit: true,
          }),
        ],
      });

      expect(result.kpi.judgedCount).toBe(3);
      // BULLISH 2/2 + BEARISH 0/1 → directional = 2/3 ≈ 66.7
      expect(result.kpi.directionalAccuracy).toBe(66.7);
      expect(result.dailyTrend).toEqual([
        {
          date: '2026-05-10',
          directionalAccuracy: 66.7,
          judgedCount: 3,
        },
      ]);
    });

    it('同じ日付・同じ銘柄が複数あっても件数として加算する（防御）', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            tickerId: 'A1',
            signal: 'BULLISH',
            hit: true,
          }),
          makeEvaluated({
            date: '2026-05-10',
            tickerId: 'A1',
            signal: 'BULLISH',
            hit: false,
          }),
        ],
      });

      expect(result.kpi.judgedCount).toBe(2);
      expect(result.kpi.totalAccuracy).toBe(50);
    });
  });

  describe('aggregateEvaluatedSummaries - 防御的フィルタ', () => {
    it('AiAnalysisError がある summary は集計から除外する', () => {
      const valid = makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true });
      const withError = {
        ...makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: false }),
        AiAnalysisError: 'OpenAI rate limit',
      };

      const result = aggregateEvaluatedSummaries({
        evaluated: [valid, withError as EvaluatedDailySummary],
      });

      expect(result.kpi.judgedCount).toBe(1);
      expect(result.kpi.totalAccuracy).toBe(100);
      expect(result.bySignal.find((s) => s.signal === 'BEARISH')).toEqual({
        signal: 'BEARISH',
        accuracy: null,
        count: 0,
      });
    });

    it('AiAnalysisResult が undefined の summary は集計から除外する', () => {
      const valid = makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true });
      const withoutResult = {
        ...makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: false }),
        AiAnalysisResult: undefined,
      };

      const result = aggregateEvaluatedSummaries({
        evaluated: [valid, withoutResult as unknown as EvaluatedDailySummary],
      });

      expect(result.kpi.judgedCount).toBe(1);
      expect(result.kpi.totalAccuracy).toBe(100);
    });
  });

  describe('aggregateEvaluatedSummaries - bySignal の順序', () => {
    it('bySignal は常に BULLISH → NEUTRAL → BEARISH の順序で返す（count=0 でも省略しない）', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          // 投入順は BEARISH → NEUTRAL → BULLISH
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
        ],
      });

      expect(result.bySignal.map((s) => s.signal)).toEqual(['BULLISH', 'NEUTRAL', 'BEARISH']);
      expect(result.bySignal[0]).toEqual({
        signal: 'BULLISH',
        accuracy: null,
        count: 0,
      });
    });
  });
});
