/**
 * Alerts API Endpoint (by Ticker ID)
 *
 * GET /api/alerts/tickers/[tickerId] - ティッカー単位のアラート一覧取得
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { createAlertRepository, createTickerRepository } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../../lib/auth';
import { withApiErrorReporting } from '../../../../../lib/api-error-reporting';
import { MAX_ALERTS_PER_USER } from '../../../../../lib/constants';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';

const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDの形式が不正です',
} as const;

interface AlertResponse {
  alertId: string;
  tickerId: string;
  symbol: string;
  name: string;
  mode: string;
  frequency: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: number;
    isPercentage?: boolean;
    percentageValue?: number;
    basePrice?: number;
  }>;
  logicalOperator?: 'AND' | 'OR';
  enabled: boolean;
  temporary?: boolean;
  temporaryExpireDate?: string;
  customMessage?: string;
  createdAt: string;
  updatedAt: string;
}

function mapAlertToResponse(
  alert: AlertEntity,
  tickerSymbol: string,
  tickerName: string
): AlertResponse {
  const response: AlertResponse = {
    alertId: alert.alertId,
    tickerId: alert.tickerId,
    symbol: tickerSymbol,
    name: tickerName,
    mode: alert.mode,
    frequency: alert.frequency,
    conditions: alert.conditionList,
    enabled: alert.enabled,
    temporary: alert.temporary,
    temporaryExpireDate: alert.temporaryExpireDate,
    createdAt: new Date(alert.createdAt).toISOString(),
    updatedAt: new Date(alert.updatedAt).toISOString(),
  };

  if (alert.logicalOperator) {
    response.logicalOperator = alert.logicalOperator;
  }
  if (alert.customMessage) {
    response.customMessage = alert.customMessage;
  }

  return response;
}

export const GET = withApiErrorReporting(
  'Web API: ティッカー単位のアラート一覧取得エラー',
  withAuth(
    getSession,
    'stocks:read',
    async (
      session,
      _request: NextRequest,
      { params }: { params: Promise<{ tickerId: string }> }
    ): Promise<NextResponse> => {
      const { tickerId } = await params;
      if (!tickerId || !tickerId.includes(':')) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_TICKER_ID,
          },
          { status: 400 }
        );
      }

      const alertRepo = createAlertRepository();
      const tickerRepo = createTickerRepository();
      const userId = session.user.id;

      const result = await alertRepo.getByUserId(userId, { limit: MAX_ALERTS_PER_USER });
      const targetAlerts = result.items.filter((alert) => alert.tickerId === tickerId);
      const ticker = await tickerRepo.getById(tickerId);
      const tickerSymbol = ticker?.symbol || tickerId.split(':')[1] || '';
      const tickerName = ticker?.name || '';

      const alerts = targetAlerts.map((alert) =>
        mapAlertToResponse(alert, tickerSymbol, tickerName)
      );

      return NextResponse.json(
        {
          alerts,
          pagination: {
            count: alerts.length,
          },
        },
        { status: 200 }
      );
    }
  )
);
