import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { createInternalErrorReporting, errorReporter } from '../../../../lib/api-error-reporting';
import {
  createAlertRepository,
  createDailySummaryRepository,
  createForecastRepository,
  createHoldingRepository,
  createTickerRepository,
} from '@nagiyu/stock-tracker-core';
import { MAX_ALERTS_PER_USER } from '../../../../lib/constants';
import { toTickerForecastSummary } from '../../../../lib/forecast/ticker-forecast';
import { toPatternSummary } from '../../../../lib/summary/pattern-summary';
import type { ErrorResponse } from '@nagiyu/common';

const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDが不正です',
  NOT_FOUND: 'サマリーが見つかりません',
  INTERNAL_ERROR: 'サマリーの取得に失敗しました',
  FETCH_FORECAST_FAILED: '確度情報の取得に失敗しました',
} as const;

const REPORT_TITLES = {
  FETCH_FORECAST_FAILED: 'Web API: サマリーの確度取得エラー',
} as const;

const withInternalErrorReporting = createInternalErrorReporting(ERROR_MESSAGES.INTERNAL_ERROR);

/** 確度は付加情報のため、取得に失敗してもサマリー自体は返す */
async function fetchForecastSummary(tickerId: string, date: string) {
  try {
    return toTickerForecastSummary(
      await createForecastRepository().getByTickerAndDate(tickerId, date)
    );
  } catch (error) {
    console.error(ERROR_MESSAGES.FETCH_FORECAST_FAILED, error);
    await errorReporter.report(REPORT_TITLES.FETCH_FORECAST_FAILED, error, {
      context: { tickerId },
    });
    return null;
  }
}

export const GET = withInternalErrorReporting(
  'Web API: サマリー取得エラー',
  withAuth(
    getSession,
    'stocks:read',
    async (
      session,
      _request: Request,
      { params }: { params: Promise<{ tickerId: string }> }
    ): Promise<NextResponse> => {
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
        createHoldingRepository().getById(session.user.id, tickerId),
        createAlertRepository().getByUserId(session.user.id, { limit: MAX_ALERTS_PER_USER }),
      ]);

      const latestSummary = summaries.find((summary) => summary.tickerId === tickerId);
      if (!latestSummary) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.NOT_FOUND,
          } satisfies ErrorResponse,
          { status: 404 }
        );
      }

      const forecast = await fetchForecastSummary(tickerId, latestSummary.date);
      const patternCounts = toPatternSummary(latestSummary);

      const alerts = alertsResult.items.filter((alert) => alert.tickerId === tickerId);
      const buyAlertCount = { enabled: 0, disabled: 0 };
      const sellAlertCount = { enabled: 0, disabled: 0 };

      for (const alert of alerts) {
        const targetCount = alert.mode === 'Buy' ? buyAlertCount : sellAlertCount;
        if (alert.enabled) {
          targetCount.enabled += 1;
        } else {
          targetCount.disabled += 1;
        }
      }

      return NextResponse.json(
        {
          tickerId: latestSummary.tickerId,
          date: latestSummary.date,
          symbol: ticker?.symbol ?? latestSummary.tickerId.split(':')[1] ?? latestSummary.tickerId,
          name: ticker?.name ?? latestSummary.tickerId,
          open: latestSummary.open,
          high: latestSummary.high,
          low: latestSummary.low,
          close: latestSummary.close,
          volume: latestSummary.volume,
          updatedAt: new Date(latestSummary.updatedAt).toISOString(),
          buyAlertCount,
          sellAlertCount,
          holding: holding
            ? {
                quantity: holding.quantity,
                averagePrice: holding.averagePrice,
              }
            : null,
          forecast,
          buyPatternCount: patternCounts.buyPatternCount,
          sellPatternCount: patternCounts.sellPatternCount,
        },
        { status: 200 }
      );
    }
  )
);
