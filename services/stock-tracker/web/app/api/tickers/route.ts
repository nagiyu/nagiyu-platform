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
import { EntityAlreadyExistsError } from '@nagiyu/aws';
import { validateTickerCreateData, type TickerEntity } from '@nagiyu/stock-tracker-core';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import { withApiErrorReporting } from '../../../lib/api-error-reporting';
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
export const GET = withApiErrorReporting(
  'Web API: ティッカー一覧取得エラー',
  withAuth(getSession, 'stocks:read', async (_session, request: NextRequest) => {
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
        tickerId: ticker.tickerId,
        symbol: ticker.symbol,
        name: ticker.name,
        exchangeId: ticker.exchangeId,
      })),
    };

    return NextResponse.json(response, { status: 200 });
  })
);

/**
 * POST /api/tickers
 * ティッカー作成（stock-admin のみ）
 */
export const POST = withApiErrorReporting(
  'Web API: ティッカー作成エラー',
  withAuth(getSession, 'stocks:manage-data', async (_session, request: NextRequest) => {
    // リクエストボディの取得
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
        },
        { status: 400 }
      );
    }
    const { symbol, name, exchangeId } = bodyResult.body;

    // バリデーション
    // 型の絞り込みも兼ねる (検証を通った値は文字列だが、型システムには伝わらないため)
    const validationResult = validateTickerCreateData(bodyResult.body);
    if (
      !validationResult.valid ||
      typeof symbol !== 'string' ||
      typeof name !== 'string' ||
      typeof exchangeId !== 'string'
    ) {
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
    const exchange = await exchangeRepo.getById(exchangeId);
    if (!exchange) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
        },
        { status: 400 }
      );
    }
    const exchangeKey = exchange.key;

    // ティッカー作成（TickerID は自動生成: {Exchange.key}:{symbol}）
    try {
      const createdTicker = await tickerRepo.create({
        tickerId: `${exchangeKey}:${symbol}`,
        symbol,
        name,
        exchangeId,
      });

      // レスポンス形式に変換
      const response: CreateTickerResponse = {
        tickerId: createdTicker.tickerId,
        symbol: createdTicker.symbol,
        name: createdTicker.name,
        exchangeId: createdTicker.exchangeId,
        createdAt: new Date(createdTicker.createdAt).toISOString(),
      };

      return NextResponse.json(response, { status: 201 });
    } catch (error) {
      // ティッカーが既に存在する場合
      if (error instanceof EntityAlreadyExistsError) {
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
  })
);
