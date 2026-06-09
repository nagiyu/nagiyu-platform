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
 *
 * `actualReturn` は省略時、signal × hit の組み合わせに応じてデフォルト値を設定する。
 * threshold=0.5 での classifyHit の結果が `hit` と一致するよう設計している:
 *   - BULLISH  + hit=true  → 1.0  (>= 0.5 → Hit)
 *   - BULLISH  + hit=false → 0.0  (< 0.5  → Miss)
 *   - BEARISH  + hit=true  → -1.0 (<= -0.5 → Hit)
 *   - BEARISH  + hit=false → 0.0  (> -0.5 → Miss)
 *   - NEUTRAL  + hit=true  → 0.0  (-0.5 < 0.0 < 0.5 → Hit)
 *   - NEUTRAL  + hit=false → 1.0  (>= 0.5 → Miss)
 */
function defaultActualReturn(signal: InvestmentSignal, hit: boolean): number {
  if (signal === 'BEARISH') return hit ? -1.0 : 0.0;
  if (signal === 'NEUTRAL') return hit ? 0.0 : 1.0;
  // BULLISH
  return hit ? 1.0 : 0.0;
}

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
  ActualReturn: overrides.actualReturn ?? defaultActualReturn(overrides.signal, overrides.hit),
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
        neutralRatio: null,
      });
      expect(result.dailyTrend).toEqual([]);
      expect(result.bySignal).toEqual([
        { signal: 'BULLISH', accuracy: null, count: 0, baseline: null, edge: null },
        { signal: 'NEUTRAL', accuracy: null, count: 0, baseline: null, edge: null },
        { signal: 'BEARISH', accuracy: null, count: 0, baseline: null, edge: null },
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

      // baseline: 全 6 件
      //   up (>= 0.5): BULLISH hit × 2 (1.0), NEUTRAL miss × 1 (1.0) = 3 件 → 50%
      //   down (<= -0.5): BEARISH hit × 1 (-1.0) = 1 件 → 16.7%
      //   flat: BULLISH miss × 1 (0.0), BEARISH miss × 1 (0.0) = 2 件 → 33.3%
      expect(result.bySignal[0].signal).toBe('BULLISH');
      expect(result.bySignal[0].accuracy).toBe(66.7);
      expect(result.bySignal[0].count).toBe(3);
      expect(result.bySignal[1].signal).toBe('NEUTRAL');
      expect(result.bySignal[1].accuracy).toBe(0);
      expect(result.bySignal[1].count).toBe(1);
      expect(result.bySignal[2].signal).toBe('BEARISH');
      expect(result.bySignal[2].accuracy).toBe(50);
      expect(result.bySignal[2].count).toBe(2);
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
      const bearishEntry = result.bySignal.find((s) => s.signal === 'BEARISH');
      expect(bearishEntry).toBeDefined();
      expect(bearishEntry?.accuracy).toBeNull();
      expect(bearishEntry?.count).toBe(0);
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

  describe('aggregateEvaluatedSummaries - thresholdPercent', () => {
    it('出力に thresholdPercent が含まれる', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });
      expect(typeof result.thresholdPercent).toBe('number');
    });

    it('threshold 省略時は 0.5 が適用される', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });
      expect(result.thresholdPercent).toBe(0.5);
    });

    it('threshold=0.5 指定時と省略時で同じ結果を返す（後方互換）', () => {
      // ActualReturn=1.0 は threshold=0.5 で BULLISH=Hit
      const summaries = [
        makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true, actualReturn: 1.0 }),
        makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: false, actualReturn: 0.3 }),
        makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: true, actualReturn: -0.7 }),
      ];

      const withDefault = aggregateEvaluatedSummaries({ evaluated: summaries });
      const withExplicit = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 0.5,
      });

      expect(withDefault.kpi).toEqual(withExplicit.kpi);
      expect(withDefault.bySignal).toEqual(withExplicit.bySignal);
      expect(withDefault.dailyTrend).toEqual(withExplicit.dailyTrend);
      expect(withDefault.thresholdPercent).toBe(0.5);
      expect(withExplicit.thresholdPercent).toBe(0.5);
    });

    it('threshold を変えると Hit 集計が変わる', () => {
      // ActualReturn=0.6 のケース:
      //   threshold=0.5 なら BULLISH は Hit（0.6 >= 0.5）
      //   threshold=1.0 なら BULLISH は Miss（0.6 < 1.0）
      const summaries = [
        makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true, actualReturn: 0.6 }),
      ];

      const resultLow = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 0.5,
      });
      const resultHigh = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 1.0,
      });

      expect(resultLow.kpi.totalAccuracy).toBe(100);
      expect(resultHigh.kpi.totalAccuracy).toBe(0);
      expect(resultLow.thresholdPercent).toBe(0.5);
      expect(resultHigh.thresholdPercent).toBe(1.0);
    });

    it('NEUTRAL シグナルでも threshold 変更で Hit/Miss が切り替わる', () => {
      // ActualReturn=0.4 のケース:
      //   threshold=0.5 なら NEUTRAL は Hit（-0.5 < 0.4 < 0.5）
      //   threshold=0.3 なら NEUTRAL は Miss（0.4 >= 0.3）
      const summaries = [
        makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true, actualReturn: 0.4 }),
      ];

      const resultLow = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 0.5,
      });
      const resultHigh = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 0.3,
      });

      expect(resultLow.kpi.totalAccuracy).toBe(100);
      expect(resultHigh.kpi.totalAccuracy).toBe(0);
    });

    it('thresholdPercent を明示指定した値が出力に反映される', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [], thresholdPercent: 1.5 });
      expect(result.thresholdPercent).toBe(1.5);
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
      expect(result.bySignal[0].signal).toBe('BULLISH');
      expect(result.bySignal[0].accuracy).toBeNull();
      expect(result.bySignal[0].count).toBe(0);
    });
  });

  describe('aggregateEvaluatedSummaries - ベースライン（市場ベースレート）', () => {
    it('全件を母数として up/down/flat 率を算出する（閾値 0.5 で分類）', () => {
      // 全 4 件:
      //   ActualReturn=1.0  → up  (>= +0.5)
      //   ActualReturn=0.5  → up  (境界値 = +0.5 は up 側)
      //   ActualReturn=-0.5 → down (境界値 = -0.5 は down 側)
      //   ActualReturn=0.3  → flat (-0.5 < 0.3 < +0.5)
      // upRate = 2/4 = 50%, downRate = 1/4 = 25%, flatRate = 1/4 = 25%
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 1.0,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 0.5,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: true,
            actualReturn: -0.5,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'NEUTRAL',
            hit: true,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      expect(result.baseline.upRate).toBe(50);
      expect(result.baseline.downRate).toBe(25);
      expect(result.baseline.flatRate).toBe(25);
    });

    it('境界値 ActualReturn=+t は up 側に分類される', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 0.5,
          }),
        ],
        thresholdPercent: 0.5,
      });

      expect(result.baseline.upRate).toBe(100);
      expect(result.baseline.downRate).toBe(0);
      expect(result.baseline.flatRate).toBe(0);
    });

    it('境界値 ActualReturn=-t は down 側に分類される', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: true,
            actualReturn: -0.5,
          }),
        ],
        thresholdPercent: 0.5,
      });

      expect(result.baseline.upRate).toBe(0);
      expect(result.baseline.downRate).toBe(100);
      expect(result.baseline.flatRate).toBe(0);
    });

    it('n=0 のとき baseline は 3 つとも null', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });

      expect(result.baseline.upRate).toBeNull();
      expect(result.baseline.downRate).toBeNull();
      expect(result.baseline.flatRate).toBeNull();
    });

    it('threshold を変えると baseline の分類が変わる', () => {
      // ActualReturn=0.6:
      //   threshold=0.5 → up（0.6 >= 0.5）
      //   threshold=1.0 → flat（-1.0 < 0.6 < 1.0）
      const summaries = [
        makeEvaluated({
          date: '2026-05-10',
          signal: 'BULLISH',
          hit: true,
          actualReturn: 0.6,
        }),
      ];

      const resultLow = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 0.5,
      });
      const resultHigh = aggregateEvaluatedSummaries({
        evaluated: summaries,
        thresholdPercent: 1.0,
      });

      expect(resultLow.baseline.upRate).toBe(100);
      expect(resultLow.baseline.flatRate).toBe(0);
      expect(resultHigh.baseline.upRate).toBe(0);
      expect(resultHigh.baseline.flatRate).toBe(100);
    });
  });

  describe('aggregateEvaluatedSummaries - kpi.neutralRatio', () => {
    it('NEUTRAL 予測件数 / 全判定済み件数（%）を算出する', () => {
      // BULLISH × 2, NEUTRAL × 1 = neutralRatio = 1/3 ≈ 33.3%
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: false }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
        ],
      });

      expect(result.kpi.neutralRatio).toBe(33.3);
    });

    it('全件 NEUTRAL のとき neutralRatio = 100', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'NEUTRAL', hit: false }),
        ],
      });

      expect(result.kpi.neutralRatio).toBe(100);
    });

    it('NEUTRAL が 0 件のとき neutralRatio = 0', () => {
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({ date: '2026-05-10', signal: 'BULLISH', hit: true }),
          makeEvaluated({ date: '2026-05-10', signal: 'BEARISH', hit: true }),
        ],
      });

      expect(result.kpi.neutralRatio).toBe(0);
    });

    it('judgedCount=0 のとき neutralRatio = null', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });

      expect(result.kpi.neutralRatio).toBeNull();
    });
  });

  describe('aggregateEvaluatedSummaries - bySignal の baseline と edge', () => {
    it('BULLISH の baseline は upRate に対応する', () => {
      // BULLISH 2 件: ActualReturn=1.0（up）, 0.3（flat）
      // upRate = 1/2 = 50%, BULLISH accuracy = 1/2 = 50%
      // edge = 50 - 50 = 0
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 1.0,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: false,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      const bullish = result.bySignal.find((s) => s.signal === 'BULLISH');
      expect(bullish?.baseline).toBe(50);
      expect(bullish?.edge).toBe(0);
    });

    it('BEARISH の baseline は downRate に対応する', () => {
      // BEARISH 2 件: ActualReturn=-1.0（down）, 0.3（flat）
      // downRate = 1/2 = 50%, BEARISH accuracy = 1/2 = 50%
      // edge = 50 - 50 = 0
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: true,
            actualReturn: -1.0,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: false,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      const bearish = result.bySignal.find((s) => s.signal === 'BEARISH');
      expect(bearish?.baseline).toBe(50);
      expect(bearish?.edge).toBe(0);
    });

    it('NEUTRAL の baseline は flatRate に対応する', () => {
      // NEUTRAL 1 件: ActualReturn=0.3（flat）
      // flatRate = 1/1 = 100%, NEUTRAL accuracy = 1/1 = 100%
      // edge = 100 - 100 = 0
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'NEUTRAL',
            hit: true,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      const neutral = result.bySignal.find((s) => s.signal === 'NEUTRAL');
      expect(neutral?.baseline).toBe(100);
      expect(neutral?.edge).toBe(0);
    });

    it('正のエッジ: BULLISH 精度がベースラインより高い', () => {
      // BULLISH 3 件, ActualReturn: 1.0, 1.0, -0.2
      // accuracy = 2/3 ≈ 66.7%
      // upRate（全 3 件母数）: up 件数 = 2（1.0, 1.0）→ 2/3 ≈ 66.7%
      // 別途 downRate/flatRate も含めて baseline = upRate
      // ただし edge = accuracy - baseline = 66.7 - 66.7 = 0.0
      // → プラスエッジになるケースを作る:
      //   BULLISH 2 Hit / 2 件, ActualReturn: 1.0, 0.8
      //   upRate = 2/2 = 100%
      //   accuracy = 100%
      //   edge = 0.0
      // 別の構成: BULLISH 2/3 Hit, ベースライン up = 1/3 = 33.3%
      //   BULLISH hit: 1.0, 1.0  / BULLISH miss: -0.1
      //   accuracy = 2/3 ≈ 66.7%
      //   upRate = 2/3 ≈ 66.7% (1.0, 1.0 のみ up、-0.1 は flat)
      //   → edge = 66.7 - 66.7 = 0.0 になってしまう
      // 正のエッジは accuracy > upRate の場合:
      //   BULLISH 3 件, ActualReturn: 1.0, 0.6, -0.1
      //   up = 2 (1.0, 0.6), flat = 1 (-0.1 ではなく -0.1 は flat)
      //   accuracy(BULLISH) = classifyHit(BULLISH, r, 0.5):
      //     1.0 → hit, 0.6 → hit, -0.1 → miss
      //   = 2/3 ≈ 66.7%
      //   upRate = 2/3 ≈ 66.7%
      //   edge = 0.0 ... まだ同じ
      //
      // BULLISH の accuracy > upRate となるのは、up 以外の actualReturn でも hit になるケースがないため
      // BULLISH のヒット条件は ActualReturn >= +t = upRate の定義と同じ。
      // したがって BULLISH の edge は常に accuracy ≈ upRate（誤差は丸めのみ）。
      //
      // 異なる母数で edge が生じる例:
      //   全体の母数に BEARISH が多く up が少ない → upRate が低い
      //   BULLISH は絶対 hit 率が高い → edge は正
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          // BULLISH hit （upRate に寄与）
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 1.0,
          }),
          // BEARISH hit → down に分類（全体 upRate を下げる）
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: true,
            actualReturn: -1.0,
          }),
          // BEARISH miss → flat に分類
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BEARISH',
            hit: false,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      // upRate = 1/3 ≈ 33.3%, BULLISH accuracy = 1/1 = 100%
      // edge = 100 - 33.3 = 66.7
      const bullish = result.bySignal.find((s) => s.signal === 'BULLISH');
      expect(bullish?.accuracy).toBe(100);
      expect(bullish?.baseline).toBe(33.3);
      expect(bullish?.edge).toBe(66.7);
    });

    it('負のエッジ: accuracy が null のとき edge は null', () => {
      // BULLISH が 0 件 → accuracy = null → edge = null
      // ただし baseline は全件（NEUTRAL のみ）から算出される
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'NEUTRAL',
            hit: true,
            actualReturn: 0.3,
          }),
        ],
        thresholdPercent: 0.5,
      });

      const bullish = result.bySignal.find((s) => s.signal === 'BULLISH');
      expect(bullish?.accuracy).toBeNull();
      expect(bullish?.edge).toBeNull();
    });

    it('n=0（空入力）のとき baseline と edge はすべて null', () => {
      const result = aggregateEvaluatedSummaries({ evaluated: [] });

      for (const entry of result.bySignal) {
        expect(entry.baseline).toBeNull();
        expect(entry.edge).toBeNull();
      }
    });

    it('edge は丸め済みの accuracy と baseline から計算する', () => {
      // BULLISH 3 件:
      //   全体母数 = 3（BULLISHのみ）
      //   ActualReturn: 1.0, 1.0, 0.0 → up: 2件, flat: 1件
      //   accuracy = 2/3 ≈ 66.666...% → toPercent → 66.7%
      //   upRate = 2/3 ≈ 66.666...% → toPercent → 66.7%
      //   edge = 66.7 - 66.7 = 0.0
      const result = aggregateEvaluatedSummaries({
        evaluated: [
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 1.0,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: true,
            actualReturn: 1.0,
          }),
          makeEvaluated({
            date: '2026-05-10',
            signal: 'BULLISH',
            hit: false,
            actualReturn: 0.0,
          }),
        ],
        thresholdPercent: 0.5,
      });

      const bullish = result.bySignal.find((s) => s.signal === 'BULLISH');
      expect(bullish?.accuracy).toBe(66.7);
      expect(bullish?.baseline).toBe(66.7);
      expect(bullish?.edge).toBe(0);
    });
  });
});
