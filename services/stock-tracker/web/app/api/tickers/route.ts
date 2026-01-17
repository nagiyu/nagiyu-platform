/**
 * Tickers API Endpoint
 *
 * GET /api/tickers - ティッカー一覧取得
 *
 * Query Parameters:
 * - exchangeId: 取引所ID（オプション、指定時は該当取引所のティッカーのみ取得）
 * - limit: 取得件数（デフォルト: 50、最大: 100）
 * - lastKey: ページネーション用キー（オプション）
 *
 * Required Permission: stocks:read
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TickerRepository,
  ExchangeRepository,
  getAuthError,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
import { getSession } from '../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_LIMIT: 'limit は 1 から 100 の間で指定してください',
  INTERNAL_ERROR: 'ティッカー一覧の取得に失敗しました',
  SYMBOL_REQUIRED: 'シンボルは必須です',
  SYMBOL_INVALID_FORMAT: 'シンボルは1-20文字の英大文字と数字のみ使用できます',
  NAME_REQUIRED: '銘柄名は必須です',
  NAME_TOO_LONG: '銘柄名は200文字以内で入力してください',
  EXCHANGE_ID_REQUIRED: '取引所IDは必須です',
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  TICKER_CREATE_FAILED: 'ティッカーの作成に失敗しました',
  TICKER_ALREADY_EXISTS: 'ティッカーは既に存在します',
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
  pagination: {
    count: number;
    lastKey?: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
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
export async function GET(
  request: NextRequest
): Promise<NextResponse<TickersListResponse | ErrorResponse>> {
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
    const exchangeId = searchParams.get('exchangeId');
    const limitParam = searchParams.get('limit');
    const lastKey = searchParams.get('lastKey');

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

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const tickerRepo = new TickerRepository(docClient, tableName);

    // ティッカー一覧取得
    let tickers;
    if (exchangeId) {
      // 取引所IDが指定されている場合は該当取引所のティッカーのみ取得
      tickers = await tickerRepo.getByExchange(exchangeId);
    } else {
      // 全ティッカー取得
      tickers = await tickerRepo.getAll();
    }

    // ページネーション処理
    // TODO: Phase 1 では簡易実装（全件取得後にメモリ上でページング）
    // Phase 2 でDynamoDB側でのページネーションを実装
    let startIndex = 0;
    if (lastKey) {
      // lastKey は前回の最後のティッカーID
      const lastIndex = tickers.findIndex((t) => t.TickerID === lastKey);
      if (lastIndex >= 0) {
        startIndex = lastIndex + 1;
      }
    }

    const pagedTickers = tickers.slice(startIndex, startIndex + limit);
    const nextLastKey =
      pagedTickers.length === limit && startIndex + limit < tickers.length
        ? pagedTickers[pagedTickers.length - 1].TickerID
        : undefined;

    // レスポンス形式に変換
    const response: TickersListResponse = {
      tickers: pagedTickers.map((ticker) => ({
        tickerId: ticker.TickerID,
        symbol: ticker.Symbol,
        name: ticker.Name,
        exchangeId: ticker.ExchangeID,
      })),
      pagination: {
        count: pagedTickers.length,
        ...(nextLastKey && { lastKey: nextLastKey }),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching tickers:', error);
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
 * POST /api/tickers
 * ティッカー作成（stock-admin のみ）
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateTickerResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック（stocks:manage-data 必須）
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:manage-data');

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
    const body: CreateTickerRequest = await request.json();

    // バリデーション: Symbol
    if (!body.symbol || typeof body.symbol !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.SYMBOL_REQUIRED,
        },
        { status: 400 }
      );
    }
    if (!/^[A-Z0-9]{1,20}$/.test(body.symbol)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.SYMBOL_INVALID_FORMAT,
        },
        { status: 400 }
      );
    }

    // バリデーション: Name
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.NAME_REQUIRED,
        },
        { status: 400 }
      );
    }
    if (body.name.length > 200) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.NAME_TOO_LONG,
        },
        { status: 400 }
      );
    }

    // バリデーション: ExchangeID
    if (!body.exchangeId || typeof body.exchangeId !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.EXCHANGE_ID_REQUIRED,
        },
        { status: 400 }
      );
    }

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const exchangeRepo = new ExchangeRepository(docClient, tableName);
    const tickerRepo = new TickerRepository(docClient, tableName);

    // 取引所の存在確認と Key 取得
    let exchangeKey: string;
    try {
      const exchange = await exchangeRepo.getById(body.exchangeId);
      exchangeKey = exchange.Key;
    } catch (error) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
        },
        { status: 400 }
      );
    }

    // ティッカー作成（TickerID は自動生成: {Exchange.Key}:{Symbol}）
    try {
      const createdTicker = await tickerRepo.create(
        {
          Symbol: body.symbol,
          Name: body.name,
          ExchangeID: body.exchangeId,
        },
        exchangeKey
      );

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
      if (error instanceof Error && error.message.includes('既に存在します')) {
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
    console.error('Error creating ticker:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.TICKER_CREATE_FAILED,
      },
      { status: 500 }
    );
  }
}
