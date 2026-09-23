/**
 * Tickers API Endpoint
 *
 * GET /api/tickers - ティッカー一覧取得（全件、ページネーションなし）
 *
 * Query Parameters:
 * - exchangeId: 取引所ID（オプション、指定時は該当取引所のティッカーのみ取得）
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import {
  TickerAlreadyExistsError,
  validateTickerCreateData,
  type TickerEntity,
} from '@nagiyu/stock-tracker-core';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import { createTickerRepository, createExchangeRepository } from '../../../lib/repository-factory';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INTERNAL_ERROR: 'ティッカー一覧の取得に失敗しました',
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  TICKER_CREATE_FAILED: 'ティッカーの作成に失敗しました',
  TICKER_ALREADY_EXISTS: 'ティッカーは既に存在します',
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
} as const;

/**
 * レスポンス型定義
 */
interface TickerResponse {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
}

interface TickersListResponse {
  tickers: TickerResponse[];
}

/**
 * POST リクエストボディ型定義
 */
interface CreateTickerRequest {
  symbol: string;
  name: string;
  exchangeId: string;
}

/**
 * POST レスポンス型定義
 */
interface CreateTickerResponse {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
  createdAt: string;
}

/**
 * GET /api/tickers
 * ティッカー一覧取得
 */
export const GET = withAuth(getSession, 'stocks:read', async (_session, request: NextRequest) => {
  try {
    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const exchangeId = searchParams.get('exchangeId');

    // リポジトリを初期化
    const tickerRepo = createTickerRepository();

    // ティッカー一覧取得（全件返却契約）
    let tickers: TickerEntity[];
    if (exchangeId) {
      // 取引所IDが指定されている場合は該当取引所のティッカーのみ取得
      tickers = await tickerRepo.getByExchange(exchangeId);
    } else {
      // 全ティッカー取得
      tickers = (await tickerRepo.getAll()).items;
    }

    // レスポンス形式に変換
    const response: TickersListResponse = {
      tickers: tickers.map((ticker: TickerEntity) => ({
        tickerId: ticker.TickerID,
        symbol: ticker.Symbol,
        name: ticker.Name,
        exchangeId: ticker.ExchangeID,
      })),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
});

/**
 * POST /api/tickers
 * ティッカー作成（stock-admin のみ）
 */
export const POST = withAuth(
  getSession,
  'stocks:manage-data',
  async (_session, request: NextRequest) => {
    try {
      // リクエストボディの取得
      let body: CreateTickerRequest;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
          },
          { status: 400 }
        );
      }

      // バリデーション
      const validationResult = validateTickerCreateData(body);
      if (!validationResult.valid) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: validationResult.errors?.[0] || 'バリデーションエラー',
          },
          { status: 400 }
        );
      }

      // リポジトリの初期化
      const exchangeRepo = createExchangeRepository();
      const tickerRepo = createTickerRepository();

      // 取引所の存在確認と Key 取得
      const exchange = await exchangeRepo.getById(body.exchangeId);
      if (!exchange) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
          },
          { status: 400 }
        );
      }
      const exchangeKey = exchange.Key;

      // ティッカー作成（TickerID は自動生成: {Exchange.Key}:{Symbol}）
      try {
        const createdTicker = await tickerRepo.create({
          TickerID: `${exchangeKey}:${body.symbol}`,
          Symbol: body.symbol,
          Name: body.name,
          ExchangeID: body.exchangeId,
        });

        // レスポンス形式に変換
        const response: CreateTickerResponse = {
          tickerId: createdTicker.TickerID,
          symbol: createdTicker.Symbol,
          name: createdTicker.Name,
          exchangeId: createdTicker.ExchangeID,
          createdAt: new Date(createdTicker.CreatedAt).toISOString(),
        };

        return NextResponse.json(response, { status: 201 });
      } catch (error) {
        // ティッカーが既に存在する場合
        if (error instanceof TickerAlreadyExistsError) {
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: ERROR_MESSAGES.TICKER_ALREADY_EXISTS,
            },
            { status: 400 }
          );
        }
        throw error;
      }
    } catch (error) {
      return handleApiError(error);
    }
  }
);
