import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DailySummaryMapper } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createHoldingRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';

const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDが不正です',
  NOT_FOUND: 'サマリーが見つかりません',
  INTERNAL_ERROR: 'サマリーの取得に失敗しました',
} as const;

const MAX_ALERTS_PER_USER = 1000;

interface ErrorResponse {
  error: string;
  message: string;
}

const dailySummaryMapper = new DailySummaryMapper();

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    session,
    _request: Request,
    { params }: { params: Promise<{ tickerId: string }> }
  ): Promise<NextResponse> => {
    try {
      const { tickerId } = await params;

      if (!tickerId || !tickerId.includes(':')) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_TICKER_ID,
          } satisfies ErrorResponse,
          { status: 400 }
        );
      }

      const exchangeId = tickerId.split(':')[0];
      const [ticker, summaries, holding, alertsResult] = await Promise.all([
        createTickerRepository().getById(tickerId),
        createDailySummaryRepository().getByExchange(exchangeId),
        createHoldingRepository().getById(session.user.userId, tickerId),
        createAlertRepository().getByUserId(session.user.userId, { limit: MAX_ALERTS_PER_USER }),
      ]);

      const latestSummary = summaries.find((summary) => summary.TickerID === tickerId);
      if (!latestSummary) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.NOT_FOUND,
          } satisfies ErrorResponse,
          { status: 404 }
        );
      }

      const alerts = alertsResult.items.filter((alert) => alert.TickerID === tickerId);
      const buyAlertCount = { enabled: 0, disabled: 0 };
      const sellAlertCount = { enabled: 0, disabled: 0 };

      for (const alert of alerts) {
        const targetCount = alert.Mode === 'Buy' ? buyAlertCount : sellAlertCount;
        if (alert.Enabled) {
          targetCount.enabled += 1;
        } else {
          targetCount.disabled += 1;
        }
      }

      return NextResponse.json(
        {
          tickerId: latestSummary.TickerID,
          symbol: ticker?.Symbol ?? latestSummary.TickerID.split(':')[1] ?? latestSummary.TickerID,
          name: ticker?.Name ?? latestSummary.TickerID,
          open: latestSummary.Open,
          high: latestSummary.High,
          low: latestSummary.Low,
          close: latestSummary.Close,
          volume: latestSummary.Volume,
          updatedAt: new Date(latestSummary.UpdatedAt).toISOString(),
          buyAlertCount,
          sellAlertCount,
          holding: holding
            ? {
                quantity: holding.Quantity,
                averagePrice: holding.AveragePrice,
              }
            : null,
          ...dailySummaryMapper.toTickerSummaryResponse(latestSummary),
        },
        { status: 200 }
      );
    } catch {
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.INTERNAL_ERROR,
        } satisfies ErrorResponse,
        { status: 500 }
      );
    }
  }
);
