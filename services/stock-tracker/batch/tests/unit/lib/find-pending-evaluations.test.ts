/**
 * Unit tests for findPendingEvaluations
 */

import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  InMemoryDailySummaryRepository,
  InMemoryExchangeRepository,
} from '@nagiyu/stock-tracker-core';
import type { AiAnalysisResult, CreateDailySummaryInput } from '@nagiyu/stock-tracker-core';
import { findPendingEvaluations } from '../../../src/lib/find-pending-evaluations.js';

const baseAiResult = (): AiAnalysisResult => ({
  priceMovementAnalysis: 'test',
  patternAnalysis: 'test',
  supportLevels: [90, 85, 80],
  resistanceLevels: [110, 115, 120],
  relatedMarketTrend: 'test',
  investmentJudgment: {
    signal: 'BULLISH',
    reason: 'test',
  },
});

function createSummaryInput(
  override: Partial<CreateDailySummaryInput>
): CreateDailySummaryInput {
  return {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Date: '2026-02-26',
    Open: 100,
    High: 110,
    Low: 95,
    Close: 105,
    Volume: 1000,
    AiAnalysisResult: baseAiResult(),
    ...override,
  };
}

describe('findPendingEvaluations', () => {
  let store: InMemorySingleTableStore;
  let exchangeRepository: InMemoryExchangeRepository;
  let dailySummaryRepository: InMemoryDailySummaryRepository;

  beforeEach(async () => {
    store = new InMemorySingleTableStore();
    exchangeRepository = new InMemoryExchangeRepository(store);
    dailySummaryRepository = new InMemoryDailySummaryRepository(store);

    await exchangeRepository.create({
      ExchangeID: 'NASDAQ',
      Name: 'NASDAQ',
      Key: 'NSDQ',
      Timezone: 'America/New_York',
      Start: '09:00',
      End: '17:00',
    });
  });

  // 2026-02-27 (金) 23:00 UTC = 18:00 EST (取引終了後)
  // → NASDAQ の getLastTradingDate = 2026-02-27
  const NOW = Date.UTC(2026, 1, 27, 23, 0, 0);

  describe('採点対象の抽出', () => {
    it('AiAnalysisResult あり / AiAnalysisError なし / EvaluatedAt 未設定 の予測を返す', async () => {
      await dailySummaryRepository.upsert(createSummaryInput({ Date: '2026-02-26' }));

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(1);
      expect(result[0].summary.Date).toBe('2026-02-26');
      expect(result[0].evaluationDate).toBe('2026-02-27');
      expect(result[0].exchange.ExchangeID).toBe('NASDAQ');
    });

    it('翌営業日がまだ閉まっていない予測はスキップする', async () => {
      // 予測日 2026-02-27（金）→ 翌営業日 2026-03-02（月）
      // 現在 = 2026-02-27 18:00 EST、L = 2026-02-27 のため翌営業日はまだ未確定
      await dailySummaryRepository.upsert(createSummaryInput({ Date: '2026-02-27' }));

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(0);
    });

    it('週末を跨ぐ予測（金曜日）は翌週月曜が引け済みなら採点対象になる', async () => {
      // 予測日 2026-02-20（金）→ 翌営業日 2026-02-23（月）
      // 現在 = 2026-02-27（金）、L = 2026-02-27、2026-02-23 <= L → 採点対象
      await dailySummaryRepository.upsert(createSummaryInput({ Date: '2026-02-20' }));

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(1);
      expect(result[0].evaluationDate).toBe('2026-02-23');
    });

    it('AiAnalysisError がある予測は除外する', async () => {
      await dailySummaryRepository.upsert(
        createSummaryInput({
          Date: '2026-02-26',
          AiAnalysisError: 'OpenAI failure',
        })
      );

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(0);
    });

    it('AiAnalysisResult がない予測は除外する', async () => {
      await dailySummaryRepository.upsert(
        createSummaryInput({
          Date: '2026-02-26',
          AiAnalysisResult: undefined,
        })
      );

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(0);
    });

    it('既に採点済みの予測は除外する', async () => {
      await dailySummaryRepository.upsert(
        createSummaryInput({
          Date: '2026-02-26',
          EvaluatedAt: Date.now(),
          EvaluationDate: '2026-02-27',
          EvaluationClose: 110,
          ActualReturn: 4.76,
          Hit: true,
          EvaluationThresholdPercent: 0.5,
        })
      );

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toHaveLength(0);
    });

    it('windowDays より古い予測は走査対象外', async () => {
      // 走査窓を 5 日に絞り、6 日前の予測は除外されることを確認
      await dailySummaryRepository.upsert(createSummaryInput({ Date: '2026-02-20' }));

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW,
        { windowDays: 5 }
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('複数取引所', () => {
    it('引け済みの取引所ごとに採点対象を集約する', async () => {
      await exchangeRepository.create({
        ExchangeID: 'TSE',
        Name: 'Tokyo Stock Exchange',
        Key: 'TSE',
        Timezone: 'Asia/Tokyo',
        Start: '09:00',
        End: '15:00',
      });

      await dailySummaryRepository.upsert(createSummaryInput({ Date: '2026-02-26' }));
      await dailySummaryRepository.upsert(
        createSummaryInput({
          TickerID: 'TSE:7203',
          ExchangeID: 'TSE',
          Date: '2026-02-26',
        })
      );

      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      const exchangeIds = result.map((r) => r.exchange.ExchangeID).sort();
      expect(exchangeIds).toEqual(['NASDAQ', 'TSE']);
    });
  });

  describe('空状態', () => {
    it('取引所が 0 件なら空配列を返す', async () => {
      const emptyStore = new InMemorySingleTableStore();
      const emptyExchangeRepo = new InMemoryExchangeRepository(emptyStore);
      const emptyDailySummaryRepo = new InMemoryDailySummaryRepository(emptyStore);

      const result = await findPendingEvaluations(
        emptyExchangeRepo,
        emptyDailySummaryRepo,
        NOW
      );

      expect(result).toEqual([]);
    });

    it('採点対象がなければ空配列を返す', async () => {
      const result = await findPendingEvaluations(
        exchangeRepository,
        dailySummaryRepository,
        NOW
      );

      expect(result).toEqual([]);
    });
  });
});
