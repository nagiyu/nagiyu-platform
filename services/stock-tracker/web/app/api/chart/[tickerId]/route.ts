/**
 * Chart Data API Endpoint
 *
 * GET /api/chart/{tickerId} - チャートデータ取得
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getChartData,
  getAuthError,
  SUPPORTED_TIMEFRAMES,
  TRADINGVIEW_ERROR_MESSAGES,
} from '@nagiyu/stock-tracker-core';
import type { Timeframe, ChartData, ChartDataPoint } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_TICKER_ID: 'ティッカーIDが不正です',
  INVALID_TIMEFRAME: '無効な timeframe です',
  INVALID_COUNT: 'count は 1 から 500 の間で指定してください',
  INTERNAL_ERROR: 'チャートデータの取得に失敗しました',
  NOT_FOUND: 'ティッカーが見つかりません',
} as const;

/**
 * エラーレスポンス型定義
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * GET /api/chart/{tickerId}
 * チャートデータ取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tickerId: string }> }
): Promise<NextResponse<ChartData | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:read');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // パスパラメータの取得
    const { tickerId } = await params;

    // ティッカーIDのバリデーション（基本的なフォーマットチェック）
    if (!tickerId || typeof tickerId !== 'string' || !tickerId.includes(':')) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_TICKER_ID,
        },
        { status: 400 }
      );
    }

    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const timeframeParam = searchParams.get('timeframe') || '60';
    const countParam = searchParams.get('count');

    // timeframe のバリデーション
    if (!SUPPORTED_TIMEFRAMES.includes(timeframeParam as Timeframe)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_TIMEFRAME,
        },
        { status: 400 }
      );
    }
    const timeframe = timeframeParam as Timeframe;

    // count のバリデーション
    const count = countParam ? parseInt(countParam, 10) : 30;
    if (isNaN(count) || count < 1 || count > 500) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_COUNT,
        },
        { status: 400 }
      );
    }

    // TradingView API からチャートデータを取得
    let chartDataPoints: ChartDataPoint[];
    try {
      chartDataPoints = await getChartData(tickerId, timeframe, {
        count,
        session: 'extended', // 時間外取引を含む（Phase 1 仕様）
        timeout: 10000, // 10秒タイムアウト
      });
    } catch (error) {
      // TradingView API エラーのハンドリング
      if (error instanceof Error) {
        const errorMessage = error.message;

        // ティッカーが見つからない場合
        if (
          errorMessage.includes('invalid') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('symbol')
        ) {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              message: ERROR_MESSAGES.NOT_FOUND,
            },
            { status: 404 }
          );
        }

        // タイムアウトエラー
        if (errorMessage.includes(TRADINGVIEW_ERROR_MESSAGES.TIMEOUT)) {
          return NextResponse.json(
            {
              error: 'INTERNAL_ERROR',
              message: TRADINGVIEW_ERROR_MESSAGES.TIMEOUT,
            },
            { status: 504 }
          );
        }

        // レート制限エラー
        if (errorMessage.includes(TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT)) {
          return NextResponse.json(
            {
              error: 'INTERNAL_ERROR',
              message: TRADINGVIEW_ERROR_MESSAGES.RATE_LIMIT,
            },
            { status: 429 }
          );
        }
      }

      // その他のエラー
      console.error('Error fetching chart data from TradingView:', error);
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.INTERNAL_ERROR,
        },
        { status: 500 }
      );
    }

    // ティッカーIDからシンボルを抽出（例: "NSDQ:NVDA" → "NVDA"）
    const symbol = tickerId.split(':')[1] || tickerId;

    // レスポンス形式に変換
    const response: ChartData = {
      tickerId,
      symbol,
      timeframe,
      data: chartDataPoints,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error in chart API:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}
