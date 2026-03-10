import { NextRequest, NextResponse } from 'next/server';
import {
  DailySummaryMapper,
  type DailySummaryEntity,
  type ExchangeEntity,
  type PatternDetailResponse,
  type TickerEntity,
} from '@nagiyu/stock-tracker-core';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import {
  createDailySummaryRepository,
  createExchangeRepository,
  createHoldingRepository,
  createTickerRepository,
} from '../../../lib/repository-factory';

const ERROR_MESSAGES = {
  INVALID_DATE: '日付はYYYY-MM-DD形式で指定してください',
  INTERNAL_ERROR: 'サマリーの取得に失敗しました',
  FETCH_HOLDINGS_FAILED: '保有株式情報の取得に失敗しました',
} as const;
// サマリーAPIでは保有情報取得を1回のレスポンスで完結させるため、初期実装は100件を上限とする。
// getByUserId の limit で先頭100件のみ取得し、典型的な利用の保有銘柄数を満たしつつ
// レスポンス遅延や過剰なDBアクセスを抑制する。
const MAX_HOLDINGS_PER_USER = 100;

interface HoldingSummaryResponse {
  quantity: number;
  averagePrice: number;
}

interface TickerSummaryResponse {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  updatedAt: string;
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetailResponse[];
  aiAnalysis?: string;
  aiAnalysisError?: string;
  holding: HoldingSummaryResponse | null;
}

interface ExchangeSummaryGroupResponse {
  exchangeId: string;
  exchangeName: string;
  date: string | null;
  summaries: TickerSummaryResponse[];
}

interface SummariesResponse {
  exchanges: ExchangeSummaryGroupResponse[];
}

interface ErrorResponse {
  error: string;
  message: string;
}

function isValidDateFormat(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().startsWith(date);
}

function resolveTicker(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>
): TickerEntity | null {
  return tickerMap.get(summary.TickerID) ?? null;
}

const dailySummaryMapper = new DailySummaryMapper();

function toTickerSummaryResponse(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>,
  holdingMap: Map<string, HoldingSummaryResponse>
): TickerSummaryResponse {
  const ticker = resolveTicker(summary, tickerMap);
  const holding = holdingMap.get(summary.TickerID) ?? null;

  return {
    tickerId: summary.TickerID,
    symbol: ticker?.Symbol ?? summary.TickerID.split(':')[1] ?? summary.TickerID,
    name: ticker?.Name ?? summary.TickerID,
    open: summary.Open,
    high: summary.High,
    low: summary.Low,
    close: summary.Close,
    volume: summary.Volume,
    updatedAt: new Date(summary.UpdatedAt).toISOString(),
    holding,
    ...dailySummaryMapper.toTickerSummaryResponse(summary),
  };
}

async function fetchHoldingMap(userId: string): Promise<Map<string, HoldingSummaryResponse>> {
  try {
    const holdingRepository = createHoldingRepository();
    const holdingsResult = await holdingRepository.getByUserId(userId, {
      limit: MAX_HOLDINGS_PER_USER,
    });
    return new Map(
      holdingsResult.items.map((holding) => [
        holding.TickerID,
        {
          quantity: holding.Quantity,
          averagePrice: holding.AveragePrice,
        },
      ])
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_HOLDINGS_FAILED, error);
    return new Map<string, HoldingSummaryResponse>();
  }
}

async function buildExchangeSummaryGroup(
  exchange: ExchangeEntity,
  date: string | null,
  tickerMap: Map<string, TickerEntity>,
  holdingMap: Map<string, HoldingSummaryResponse>
): Promise<ExchangeSummaryGroupResponse> {
  const dailySummaryRepository = createDailySummaryRepository();
  const summaries = await dailySummaryRepository.getByExchange(
    exchange.ExchangeID,
    date || undefined
  );

  return {
    exchangeId: exchange.ExchangeID,
    exchangeName: exchange.Name,
    date: date ?? summaries[0]?.Date ?? null,
    summaries: summaries.map((summary) => toTickerSummaryResponse(summary, tickerMap, holdingMap)),
  };
}

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    session,
    request: NextRequest
  ): Promise<NextResponse<SummariesResponse | ErrorResponse>> => {
    try {
      const { searchParams } = new URL(request.url);
      const date = searchParams.get('date');

      if (date && !isValidDateFormat(date)) {
        return NextResponse.json(
          {
            error: 'INVALID_DATE',
            message: ERROR_MESSAGES.INVALID_DATE,
          },
          { status: 400 }
        );
      }

      const exchangeRepository = createExchangeRepository();
      const tickerRepository = createTickerRepository();

      const [exchanges, tickersResult] = await Promise.all([
        exchangeRepository.getAll(),
        tickerRepository.getAll(),
      ]);
      const holdingMap = await fetchHoldingMap(session.user.userId);

      const tickerMap = new Map(tickersResult.items.map((ticker) => [ticker.TickerID, ticker]));
      const exchangeSummaryGroups = await Promise.all(
        exchanges.map((exchange) =>
          buildExchangeSummaryGroup(exchange, date, tickerMap, holdingMap)
        )
      );

      return NextResponse.json({ exchanges: exchangeSummaryGroups }, { status: 200 });
    } catch {
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.INTERNAL_ERROR,
        },
        { status: 500 }
      );
    }
  }
);
