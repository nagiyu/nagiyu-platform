import { NextRequest, NextResponse } from 'next/server';
import { validateWatchlist, type Watchlist } from '@nagiyu/stock-tracker-core';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import { createWatchlistRepository, createTickerRepository } from '../../../lib/repository-factory';
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
export const GET = withAuth(getSession, 'stocks:read', async (session, request: NextRequest) => {
  try {
    // ユーザーIDを取得
    const userId = session!.user.userId;

    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const lastKeyParam = searchParams.get('lastKey');

    // lastKey を cursor に変換（base64エンコード）
    const cursor = lastKeyParam ? Buffer.from(lastKeyParam).toString('base64') : undefined;

    // Watchlist リポジトリを初期化
    const watchlistRepo = createWatchlistRepository();

    // ユーザーのウォッチリスト一覧を取得
    const result = await watchlistRepo.getByUserId(userId, { limit, cursor });

    // TickerリポジトリでSymbolとNameを取得
    // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化
    const tickerRepo = createTickerRepository();

    const watchlistItems = [];
    for (const item of result.items) {
      // ティッカーが見つからない場合はデフォルト値を使用
      let ticker;
      try {
        ticker = await tickerRepo.getById(item.TickerID);
      } catch {
        // ティッカーが見つからない場合は null として扱う
        ticker = null;
      }

      watchlistItems.push({
        watchlistId: `${item.UserID}#${item.TickerID}`,
        tickerId: item.TickerID,
        symbol: ticker?.Symbol || item.TickerID.split(':')[1] || item.TickerID,
        name: ticker?.Name || '',
        createdAt: new Date(item.CreatedAt).toISOString(),
      });
    }

    // レスポンスを返す (API仕様に従った形式)
    // nextCursor を lastKey に変換（base64デコード）
    const lastKey = result.nextCursor
      ? Buffer.from(result.nextCursor, 'base64').toString('utf-8')
      : undefined;

    return NextResponse.json({
      watchlist: watchlistItems,
      pagination: {
        count: watchlistItems.length,
        lastKey,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
});

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
export const POST = withAuth(
  getSession,
  'stocks:write-own',
  async (session, request: NextRequest) => {
    try {
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

      // Watchlist リポジトリを初期化
      const watchlistRepo = createWatchlistRepository();

      // ウォッチリストを作成
      const newWatchlist = await watchlistRepo.create(watchlistData);

      // TickerリポジトリでSymbolとNameを取得
      const tickerRepo = createTickerRepository();
      let ticker;
      try {
        ticker = await tickerRepo.getById(newWatchlist.TickerID);
      } catch {
        // ティッカーが見つからない場合は null として扱う
        ticker = null;
      }

      // レスポンスを返す (API仕様に従った形式)
      return NextResponse.json(
        {
          watchlistId: `${newWatchlist.UserID}#${newWatchlist.TickerID}`,
          tickerId: newWatchlist.TickerID,
          symbol: ticker?.Symbol || newWatchlist.TickerID.split(':')[1] || newWatchlist.TickerID,
          name: ticker?.Name || '',
          createdAt: new Date(newWatchlist.CreatedAt).toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
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
      return handleApiError(error);
    }
  }
);
