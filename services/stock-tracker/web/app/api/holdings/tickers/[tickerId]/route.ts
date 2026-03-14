/**
 * Holdings API Endpoint (by Ticker ID)
 *
 * GET /api/holdings/tickers/[tickerId] - ティッカーID指定で保有株式取得
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import {
  createHoldingRepository,
  createTickerRepository,
} from '../../../../../lib/repository-factory';
import { getSession } from '../../../../../lib/auth';
import type { Holding } from '@nagiyu/stock-tracker-core';

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

      const holdingRepo = createHoldingRepository();
      const holding = await holdingRepo.getById(session.user.userId, tickerId);

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
      const ticker = await tickerRepo.getById(holding.TickerID);

      return NextResponse.json(
        mapHoldingToResponse(
          holding,
          ticker?.Symbol || holding.TickerID.split(':')[1] || '',
          ticker?.Name || ''
        ),
        { status: 200 }
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

function mapHoldingToResponse(
  holding: Holding,
  tickerSymbol: string,
  tickerName: string
): HoldingResponse {
  const holdingId = `${holding.UserID}#${holding.TickerID}`;

  return {
    holdingId,
    tickerId: holding.TickerID,
    symbol: tickerSymbol,
    name: tickerName,
    quantity: holding.Quantity,
    averagePrice: holding.AveragePrice,
    currency: holding.Currency,
    createdAt: new Date(holding.CreatedAt).toISOString(),
    updatedAt: new Date(holding.UpdatedAt).toISOString(),
  };
}
