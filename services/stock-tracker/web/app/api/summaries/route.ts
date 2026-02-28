import { NextRequest, NextResponse } from 'next/server';
import type { DailySummaryEntity, ExchangeEntity, TickerEntity } from '@nagiyu/stock-tracker-core';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import {
  createDailySummaryRepository,
  createExchangeRepository,
  createTickerRepository,
} from '../../../lib/repository-factory';

const ERROR_MESSAGES = {
  INVALID_DATE: '日付はYYYY-MM-DD形式で指定してください',
  INTERNAL_ERROR: 'サマリーの取得に失敗しました',
} as const;

interface TickerSummaryResponse {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  updatedAt: string;
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

function toTickerSummaryResponse(
  summary: DailySummaryEntity,
  tickerMap: Map<string, TickerEntity>
): TickerSummaryResponse {
  const ticker = resolveTicker(summary, tickerMap);

  return {
    tickerId: summary.TickerID,
    symbol: ticker?.Symbol ?? summary.TickerID.split(':')[1] ?? summary.TickerID,
    name: ticker?.Name ?? summary.TickerID,
    open: summary.Open,
    high: summary.High,
    low: summary.Low,
    close: summary.Close,
    updatedAt: new Date(summary.UpdatedAt).toISOString(),
  };
}

async function buildExchangeSummaryGroup(
  exchange: ExchangeEntity,
  date: string | null,
  tickerMap: Map<string, TickerEntity>
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
    summaries: summaries.map((summary) => toTickerSummaryResponse(summary, tickerMap)),
  };
}

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    _session,
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

      const tickerMap = new Map(tickersResult.items.map((ticker) => [ticker.TickerID, ticker]));
      const exchangeSummaryGroups = await Promise.all(
        exchanges.map((exchange) => buildExchangeSummaryGroup(exchange, date, tickerMap))
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
