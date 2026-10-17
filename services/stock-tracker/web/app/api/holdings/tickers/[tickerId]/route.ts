/**
 * Holdings API Endpoint (by Ticker ID)
 *
 * GET /api/holdings/tickers/[tickerId] - ティッカーID指定で保有株式取得
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../../lib/repository-factory';
import { getSession } from '../../../../../lib/auth';
import { withApiErrorReporting } from '../../../../../lib/api-error-reporting';
import type { HoldingEntity } from '@nagiyu/stock-tracker-core';

const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDの形式が不正です',
  HOLDING_NOT_FOUND: '保有株式が見つかりません',
} as const;

interface HoldingResponse {
  holdingId: string;
  tickerId: string;
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export const GET = withApiErrorReporting(
  'Web API: 保有株式取得エラー',
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

      const holdingRepo = createHoldingRepository();
      const holding = await holdingRepo.getById(session.user.id, tickerId);

      if (!holding) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.HOLDING_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      const tickerRepo = createTickerRepository();
      const ticker = await tickerRepo.getById(holding.tickerId);

      return NextResponse.json(
        mapHoldingToResponse(
          holding,
          ticker?.symbol || holding.tickerId.split(':')[1] || '',
          ticker?.name || ''
        ),
        { status: 200 }
      );
    }
  )
);

function mapHoldingToResponse(
  holding: HoldingEntity,
  tickerSymbol: string,
  tickerName: string
): HoldingResponse {
  const holdingId = `${holding.userId}#${holding.tickerId}`;

  return {
    holdingId,
    tickerId: holding.tickerId,
    symbol: tickerSymbol,
    name: tickerName,
    quantity: holding.quantity,
    averagePrice: holding.averagePrice,
    currency: holding.currency,
    createdAt: new Date(holding.createdAt).toISOString(),
    updatedAt: new Date(holding.updatedAt).toISOString(),
  };
}
