/**
 * Holdings API Endpoint
 *
 * GET /api/holdings - 保有株式一覧取得
 * POST /api/holdings - 保有株式登録
 *
 * Required Permission: stocks:write-own (POST), stocks:read (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TickerRepository,
  HoldingRepository,
  getAuthError,
  validateHolding,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
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
export async function GET(
  request: NextRequest
): Promise<NextResponse<HoldingsListResponse | ErrorResponse>> {
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

    // lastKey のデコード（base64エンコードされている場合）
    let lastKey: { PK: string; SK: string } | undefined;
    if (lastKeyParam) {
      try {
        lastKey = JSON.parse(Buffer.from(lastKeyParam, 'base64').toString('utf-8'));
      } catch {
        // 無効な lastKey は無視
        lastKey = undefined;
      }
    }

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const holdingRepo = new HoldingRepository(docClient, tableName);

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // 保有株式一覧取得
    const result = await holdingRepo.getByUserId(userId, limit, lastKey);

    // TickerリポジトリでSymbolとNameを取得
    // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化
    const tickerRepo = new TickerRepository(docClient, tableName);

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

    // lastKey をbase64エンコード
    const encodedLastKey = result.lastKey
      ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
      : undefined;

    // レスポンス形式に変換
    const response: HoldingsListResponse = {
      holdings,
      pagination: {
        count: holdings.length,
        ...(encodedLastKey && { lastKey: encodedLastKey }),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching holdings:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/holdings
 * 保有株式登録
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<HoldingResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:write-own');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

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

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const holdingRepo = new HoldingRepository(docClient, tableName);

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
    const tickerRepo = new TickerRepository(docClient, tableName);
    const ticker = await tickerRepo.getById(createdHolding.TickerID);

    // レスポンス形式に変換
    const response = mapHoldingToResponse(
      createdHolding,
      ticker?.Symbol || createdHolding.TickerID.split(':')[1] || '',
      ticker?.Name || ''
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating holding:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.CREATE_ERROR,
      },
      { status: 500 }
    );
  }
}
