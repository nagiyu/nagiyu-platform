/**
 * Alerts API Endpoint (by Ticker ID)
 *
 * GET /api/alerts/tickers/[tickerId] - ティッカー単位のアラート一覧取得
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import {
  createAlertRepository,
  createTickerRepository,
} from '../../../../../lib/repository-factory';
import { getSession } from '../../../../../lib/auth';
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
  notificationTitle?: string;
  notificationBody?: string;
  createdAt: string;
  updatedAt: string;
}

function mapAlertToResponse(
  alert: AlertEntity,
  tickerSymbol: string,
  tickerName: string
): AlertResponse {
  const response: AlertResponse = {
    alertId: alert.AlertID,
    tickerId: alert.TickerID,
    symbol: tickerSymbol,
    name: tickerName,
    mode: alert.Mode,
    frequency: alert.Frequency,
    conditions: alert.ConditionList,
    enabled: alert.Enabled,
    temporary: alert.Temporary,
    temporaryExpireDate: alert.TemporaryExpireDate,
    createdAt: new Date(alert.CreatedAt).toISOString(),
    updatedAt: new Date(alert.UpdatedAt).toISOString(),
  };

  if (alert.LogicalOperator) {
    response.logicalOperator = alert.LogicalOperator;
  }
  if (alert.NotificationTitle) {
    response.notificationTitle = alert.NotificationTitle;
  }
  if (alert.NotificationBody) {
    response.notificationBody = alert.NotificationBody;
  }

  return response;
}

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    session,
    _request: NextRequest,
    { params }: { params: Promise<{ tickerId: string }> }
  ): Promise<NextResponse> => {
    try {
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
      const userId = session.user.userId;

      const result = await alertRepo.getByUserId(userId, { limit: MAX_ALERTS_PER_USER });
      const targetAlerts = result.items.filter((alert) => alert.TickerID === tickerId);
      const ticker = await tickerRepo.getById(tickerId);
      const tickerSymbol = ticker?.Symbol || tickerId.split(':')[1] || '';
      const tickerName = ticker?.Name || '';

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
    } catch (error) {
      return handleApiError(error);
    }
  }
);
