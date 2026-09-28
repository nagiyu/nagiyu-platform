import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import type { ErrorResponse } from '@nagiyu/common';
import { getSession } from '../../../../lib/auth';
import {
  createDailySummaryRepository,
  createForecastRepository,
  createModelSnapshotRepository,
  createTickerRepository,
} from '../../../../lib/repository-factory';
import { isValidDateFormat } from '../../../../lib/forecast/date';
import { buildForecastDetail } from '../../../../lib/forecast/forecast-detail';

const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDが不正です',
  INVALID_DATE: '日付はYYYY-MM-DD形式で指定してください',
  TICKER_NOT_FOUND: 'ティッカーが見つかりません',
  FORECAST_NOT_FOUND: '指定日の確度が見つかりません',
  INTERNAL_ERROR: '確度の取得に失敗しました',
} as const;

function errorResponse(
  error: string,
  message: string,
  status: number
): NextResponse<ErrorResponse> {
  return NextResponse.json({ error, message } satisfies ErrorResponse, { status });
}

export const GET = withAuth(
  getSession,
  'stocks:read',
  async (
    _session,
    request: NextRequest,
    { params }: { params: Promise<{ tickerId: string }> }
  ): Promise<NextResponse> => {
    try {
      const { tickerId } = await params;
      if (!tickerId) {
        return errorResponse('INVALID_REQUEST', ERROR_MESSAGES.INVALID_TICKER_ID, 400);
      }

      const requestedDate = new URL(request.url).searchParams.get('date');
      if (requestedDate && !isValidDateFormat(requestedDate)) {
        return errorResponse('INVALID_DATE', ERROR_MESSAGES.INVALID_DATE, 400);
      }

      // 取引所 ID は tickerId の分割ではなくマスタから引く（Key と ExchangeID が異なる取引所がある）
      const ticker = await createTickerRepository().getById(tickerId);
      if (!ticker) {
        return errorResponse('NOT_FOUND', ERROR_MESSAGES.TICKER_NOT_FOUND, 404);
      }

      const date =
        requestedDate ??
        (await createDailySummaryRepository().getByExchange(ticker.ExchangeID))[0]?.Date;
      if (!date) {
        return errorResponse('NOT_FOUND', ERROR_MESSAGES.FORECAST_NOT_FOUND, 404);
      }

      const forecast = await createForecastRepository().getByTickerAndDate(tickerId, date);
      if (!forecast) {
        return errorResponse('NOT_FOUND', ERROR_MESSAGES.FORECAST_NOT_FOUND, 404);
      }

      const snapshotRepository = createModelSnapshotRepository();
      const [dir, vol] = await Promise.all([
        snapshotRepository.getByDate('DIR', forecast.Market, date),
        snapshotRepository.getByDate('VOL', forecast.Market, date),
      ]);

      return NextResponse.json(buildForecastDetail(forecast, { DIR: dir, VOL: vol }), {
        status: 200,
      });
    } catch {
      return errorResponse('INTERNAL_ERROR', ERROR_MESSAGES.INTERNAL_ERROR, 500);
    }
  }
);
