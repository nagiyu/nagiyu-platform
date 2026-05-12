import { NextRequest } from 'next/server';
import { GET } from '../../../../../app/api/prediction-evaluation/summary/route';
import {
  createDailySummaryRepository,
  createExchangeRepository,
} from '../../../../../lib/repository-factory';

jest.mock('../../../../../lib/repository-factory', () => ({
  createDailySummaryRepository: jest.fn(),
  createExchangeRepository: jest.fn(),
}));

jest.mock('../../../../../lib/auth', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/nextjs', () => ({
  withAuth: jest.fn((_auth, _permission, handler) => {
    return async (...args: unknown[]) => handler({ user: { userId: 'test-user' } }, ...args);
  }),
}));

type MockedCreateExchangeRepository = jest.MockedFunction<typeof createExchangeRepository>;
type MockedCreateDailySummaryRepository = jest.MockedFunction<typeof createDailySummaryRepository>;

const BASE_SUMMARY = {
  TickerID: 'NSDQ:AAPL',
  ExchangeID: 'NASDAQ',
  Date: '2026-05-10',
  Open: 180,
  High: 185,
  Low: 179,
  Close: 183,
  CreatedAt: 1000000,
  UpdatedAt: 1000001,
};

const EVALUATED_SUMMARY = {
  ...BASE_SUMMARY,
  EvaluationDate: '2026-05-11',
  EvaluationClose: 186,
  ActualReturn: 1.64,
  Hit: true,
  EvaluationThresholdPercent: 0.5,
  EvaluatedAt: 1747699200000,
  AiAnalysisResult: {
    priceMovementAnalysis: '上昇傾向',
    patternAnalysis: 'パターン検出',
    supportLevels: [175],
    resistanceLevels: [190],
    relatedMarketTrend: 'ナスダック上昇',
    investmentJudgment: { signal: 'BULLISH', reason: '強気シグナル' },
  },
};

describe('GET /api/prediction-evaluation/summary', () => {
  const mockedCreateExchangeRepository = createExchangeRepository as MockedCreateExchangeRepository;
  const mockedCreateDailySummaryRepository =
    createDailySummaryRepository as MockedCreateDailySummaryRepository;

  const mockGetAllExchanges = jest.fn();
  const mockGetByExchangeAndDateRange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockedCreateExchangeRepository.mockReturnValue({
      getAll: mockGetAllExchanges,
    } as ReturnType<typeof createExchangeRepository>);

    mockedCreateDailySummaryRepository.mockReturnValue({
      getByExchangeAndDateRange: mockGetByExchangeAndDateRange,
    } as ReturnType<typeof createDailySummaryRepository>);
  });

  describe('バリデーション', () => {
    it('period パラメータが欠落している場合は 400 を返す', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary')
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toContain('period');
    });

    it('period が不正な値の場合は 400 を返す', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=invalid')
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('period が 14d など存在しない期間の場合は 400 を返す', async () => {
      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=14d')
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('正常系', () => {
    it('採点済みデータがある場合は SummaryResponse を返す', async () => {
      mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
      mockGetByExchangeAndDateRange.mockResolvedValue([EVALUATED_SUMMARY]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=30d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.period).toBe('30d');
      expect(typeof body.evaluatedAt).toBe('number');
      expect(body.kpi.judgedCount).toBe(1);
      expect(body.kpi.totalAccuracy).toBe(100);
      expect(Array.isArray(body.dailyTrend)).toBe(true);
      expect(body.bySignal).toHaveLength(3);
    });

    it('複数の取引所のデータを統合して集計する', async () => {
      mockGetAllExchanges.mockResolvedValue([
        { ExchangeID: 'NASDAQ', Name: 'NASDAQ' },
        { ExchangeID: 'NYSE', Name: 'NYSE' },
      ]);
      const nyseEvaluated = {
        ...EVALUATED_SUMMARY,
        TickerID: 'NYSE:MSFT',
        ExchangeID: 'NYSE',
        Hit: false,
        AiAnalysisResult: {
          ...EVALUATED_SUMMARY.AiAnalysisResult,
          investmentJudgment: { signal: 'BEARISH', reason: '弱気シグナル' },
        },
      };
      mockGetByExchangeAndDateRange
        .mockResolvedValueOnce([EVALUATED_SUMMARY])
        .mockResolvedValueOnce([nyseEvaluated]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=7d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.kpi.judgedCount).toBe(2);
    });

    it('取引所が存在しない場合は空の集計を返す', async () => {
      mockGetAllExchanges.mockResolvedValue([]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=30d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.kpi.judgedCount).toBe(0);
      expect(body.kpi.totalAccuracy).toBeNull();
      expect(body.kpi.directionalAccuracy).toBeNull();
      expect(body.dailyTrend).toHaveLength(0);
      expect(body.bySignal).toHaveLength(3);
    });

    it('採点済みデータが 0 件の場合は kpi.judgedCount=0 を返す', async () => {
      mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
      mockGetByExchangeAndDateRange.mockResolvedValue([BASE_SUMMARY]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=30d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.kpi.judgedCount).toBe(0);
      expect(body.kpi.totalAccuracy).toBeNull();
    });

    it('EvaluatedAt はあるが AiAnalysisResult がないサマリーは集計から除外する', async () => {
      const noAiSummary = {
        ...BASE_SUMMARY,
        EvaluatedAt: 1747699200000,
        EvaluationDate: '2026-05-11',
        EvaluationClose: 186,
        ActualReturn: 1.64,
        Hit: true,
        EvaluationThresholdPercent: 0.5,
      };
      mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
      mockGetByExchangeAndDateRange.mockResolvedValue([noAiSummary, EVALUATED_SUMMARY]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=7d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.kpi.judgedCount).toBe(1);
    });

    it('AiAnalysisError があるサマリーは集計から除外する', async () => {
      const errorSummary = {
        ...EVALUATED_SUMMARY,
        AiAnalysisError: 'AI解析に失敗しました',
      };
      mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
      mockGetByExchangeAndDateRange.mockResolvedValue([errorSummary, EVALUATED_SUMMARY]);

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=7d')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.kpi.judgedCount).toBe(1);
    });

    it.each([['7d'], ['30d'], ['90d'], ['all']] as const)(
      'period=%s は正常に処理される',
      async (period) => {
        mockGetAllExchanges.mockResolvedValue([]);

        const response = await GET(
          new NextRequest(`http://localhost/api/prediction-evaluation/summary?period=${period}`)
        );

        expect(response.status).toBe(200);
      }
    );
  });

  describe('異常系', () => {
    it('リポジトリエラー時は 500 を返す', async () => {
      mockGetAllExchanges.mockRejectedValue(new Error('DynamoDB 接続エラー'));

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=30d')
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('予測精度サマリーの取得に失敗しました');
    });

    it('日次サマリー取得エラー時は 500 を返す', async () => {
      mockGetAllExchanges.mockResolvedValue([{ ExchangeID: 'NASDAQ', Name: 'NASDAQ' }]);
      mockGetByExchangeAndDateRange.mockRejectedValue(new Error('GSI クエリエラー'));

      const response = await GET(
        new NextRequest('http://localhost/api/prediction-evaluation/summary?period=30d')
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });
});
