import { NextResponse } from 'next/server';
import {
  WatchlistRepository,
  getAuthError,
  validateWatchlist,
  type Watchlist,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
import { getSession } from '../../../lib/auth';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INTERNAL_ERROR: 'ウォッチリストの操作に失敗しました',
  INVALID_REQUEST: 'リクエストが不正です',
  TICKER_ID_REQUIRED: 'ティッカーIDは必須です',
} as const;

/**
 * GET /api/watchlist - ウォッチリスト一覧取得
 *
 * ユーザーのウォッチリストを取得します。
 *
 * 必要な権限: stocks:read
 *
 * @returns ウォッチリスト一覧 (200 OK)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export async function GET(request: Request) {
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

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const lastKeyParam = searchParams.get('lastKey');
    const lastKey = lastKeyParam ? JSON.parse(lastKeyParam) : undefined;

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    // Watchlist リポジトリを初期化
    const watchlistRepo = new WatchlistRepository(docClient, tableName);

    // ユーザーのウォッチリスト一覧を取得
    const result = await watchlistRepo.getByUserId(userId, limit, lastKey);

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json({
      watchlist: result.items.map((item) => ({
        watchlistId: `${item.UserID}#${item.TickerID}`,
        tickerId: item.TickerID,
        symbol: item.TickerID.split(':')[1] || item.TickerID,
        name: '', // Note: 実際の実装ではTickerRepositoryから取得する必要があるが、Phase 1では省略
        createdAt: new Date(item.CreatedAt).toISOString(),
      })),
      pagination: {
        count: result.items.length,
        lastKey: result.lastKey ? JSON.stringify(result.lastKey) : undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}

/**
 * POST /api/watchlist - ウォッチリスト登録
 *
 * ウォッチリストに銘柄を追加します。
 *
 * 必要な権限: stocks:write-own
 *
 * @returns 作成されたウォッチリスト (201 Created)
 * @returns リクエストエラー (400 Bad Request)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export async function POST(request: Request) {
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

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // リクエストボディの取得
    const body = await request.json();

    // 必須フィールドのチェック
    if (!body.tickerId) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.TICKER_ID_REQUIRED },
        { status: 400 }
      );
    }

    // ExchangeIDを抽出（TickerID形式: {Exchange.Key}:{Symbol}）
    const tickerId = body.tickerId as string;
    const exchangeId = tickerId.split(':')[0] || '';

    // ウォッチリストオブジェクトの作成
    const watchlistData: Omit<Watchlist, 'CreatedAt'> = {
      UserID: userId,
      TickerID: tickerId,
      ExchangeID: exchangeId,
    };

    // バリデーション（CreatedAtを追加してバリデーション）
    const watchlistForValidation: Watchlist = {
      ...watchlistData,
      CreatedAt: Date.now(),
    };

    const validationResult = validateWatchlist(watchlistForValidation);
    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: validationResult.errors?.join(', ') || ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    // Watchlist リポジトリを初期化
    const watchlistRepo = new WatchlistRepository(docClient, tableName);

    // ウォッチリストを作成
    const newWatchlist = await watchlistRepo.create(watchlistData);

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json(
      {
        watchlistId: `${newWatchlist.UserID}#${newWatchlist.TickerID}`,
        tickerId: newWatchlist.TickerID,
        symbol: newWatchlist.TickerID.split(':')[1] || newWatchlist.TickerID,
        name: '', // Note: 実際の実装ではTickerRepositoryから取得する必要があるが、Phase 1では省略
        createdAt: new Date(newWatchlist.CreatedAt).toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating watchlist:', error);

    // WatchlistAlreadyExistsError のハンドリング
    if (error instanceof Error && error.name === 'WatchlistAlreadyExistsError') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'このティッカーは既にウォッチリストに登録されています',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
