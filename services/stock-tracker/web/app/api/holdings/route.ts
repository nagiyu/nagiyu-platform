/**
 * Holdings API Endpoint
 *
 * GET /api/holdings - 保有株式一覧取得
 * POST /api/holdings - 保有株式登録
 *
 * Required Permission: stocks:write-own (POST), stocks:read (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateHolding } from '@nagiyu/stock-tracker-core';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import { createHoldingRepository, createTickerRepository } from '../../../lib/repository-factory';
import { getSession } from '../../../lib/auth';
import type { Holding } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_LIMIT: 'limit は 1 から 100 の間で指定してください',
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  VALIDATION_ERROR: '入力データが不正です',
  INTERNAL_ERROR: '保有株式の取得に失敗しました',
  CREATE_ERROR: '保有株式の登録に失敗しました',
  ALREADY_EXISTS: '指定された銘柄は既に保有株式として登録されています',
} as const;

/**
 * レスポンス型定義
 */
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

interface HoldingsListResponse {
  holdings: HoldingResponse[];
  pagination: {
    count: number;
    lastKey?: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: string[];
}

/**
 * Holding エンティティをレスポンス形式に変換
 */
function mapHoldingToResponse(
  holding: Holding,
  tickerSymbol: string,
  tickerName: string
): HoldingResponse {
  // HoldingID は UserID と TickerID の組み合わせ
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

/**
 * GET /api/holdings
 * 保有株式一覧取得
 */
export const GET = withAuth(getSession, 'stocks:read', async (session, request: NextRequest) => {
  try {
    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const lastKeyParam = searchParams.get('lastKey');

    // limit のバリデーション
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_LIMIT,
        },
        { status: 400 }
      );
    }

    // リポジトリの初期化
    const holdingRepo = createHoldingRepository();

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // 保有株式一覧取得
    const result = await holdingRepo.getByUserId(userId, {
      limit,
      cursor: lastKeyParam || undefined,
    });

    // TickerリポジトリでSymbolとNameを取得
    // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化
    const tickerRepo = createTickerRepository();

    const holdings: HoldingResponse[] = [];
    for (const holding of result.items) {
      // ティッカーが見つからない場合はデフォルト値を使用
      let ticker;
      try {
        ticker = await tickerRepo.getById(holding.TickerID);
      } catch {
        // ティッカーが見つからない場合は null として扱う
        ticker = null;
      }
      holdings.push(
        mapHoldingToResponse(
          holding,
          ticker?.Symbol || holding.TickerID.split(':')[1] || '',
          ticker?.Name || ''
        )
      );
    }

    // レスポンス形式に変換
    const response: HoldingsListResponse = {
      holdings,
      pagination: {
        count: holdings.length,
        ...(result.nextCursor && { lastKey: result.nextCursor }),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
});

/**
 * POST /api/holdings
 * 保有株式登録
 */
export const POST = withAuth(getSession, 'stocks:write-own', async (session, request: NextRequest) => {
  try {
    // リクエストボディの取得
    let body;
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

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // リクエストボディから Holding オブジェクトを構築
    const holdingData = {
      UserID: userId,
      TickerID: body.tickerId,
      ExchangeID: body.exchangeId || body.tickerId?.split(':')[0] || '',
      Quantity: body.quantity,
      AveragePrice: body.averagePrice,
      Currency: body.currency,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    };

    // バリデーション
    const validationResult = validateHolding(holdingData);
    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          details: validationResult.errors,
        },
        { status: 400 }
      );
    }

    // リポジトリの初期化
    const holdingRepo = createHoldingRepository();

    // 保有株式を作成
    let createdHolding: Holding;
    try {
      createdHolding = await holdingRepo.create({
        UserID: userId,
        TickerID: holdingData.TickerID,
        ExchangeID: holdingData.ExchangeID,
        Quantity: holdingData.Quantity,
        AveragePrice: holdingData.AveragePrice,
        Currency: holdingData.Currency,
      });
    } catch (error) {
      // HoldingAlreadyExistsError のチェック
      if (error instanceof Error && error.name === 'HoldingAlreadyExistsError') {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.ALREADY_EXISTS,
          },
          { status: 400 }
        );
      }
      throw error;
    }

    // TickerリポジトリでSymbolとNameを取得
    const tickerRepo = createTickerRepository();
    const ticker = await tickerRepo.getById(createdHolding.TickerID);

    // レスポンス形式に変換
    const response = mapHoldingToResponse(
      createdHolding,
      ticker?.Symbol || createdHolding.TickerID.split(':')[1] || '',
      ticker?.Name || ''
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
});
