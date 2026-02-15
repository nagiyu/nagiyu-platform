import { NextResponse } from 'next/server';
import { getAuthError } from '@nagiyu/stock-tracker-core';
import { createWatchlistRepository } from '../../../../lib/repository-factory';
import { getSession } from '../../../../lib/auth';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INTERNAL_ERROR: 'ウォッチリストの削除に失敗しました',
  NOT_FOUND: 'ウォッチリストが見つかりません',
  INVALID_ID_FORMAT: 'IDの形式が不正です',
} as const;

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * DELETE /api/watchlist/[id] - ウォッチリスト削除
 *
 * ウォッチリストから銘柄を削除します。
 * IDの形式: {userId}#{tickerId} (例: test-user-id#NSDQ:AAPL)
 *
 * 必要な権限: stocks:write-own
 *
 * @returns 削除成功 (200 OK)
 * @returns リクエストエラー (400 Bad Request)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns 見つからない (404 Not Found)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export async function DELETE(_request: Request, { params }: Params) {
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

    // パスパラメータからIDを取得
    const { id } = await params;

    // IDの形式チェック（watchlistId形式: {UserID}#{TickerID}）
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_ID_FORMAT,
        },
        { status: 400 }
      );
    }

    // watchlistIdからtickerIdを抽出（形式: {UserID}#{TickerID}）
    const hashIndex = id.indexOf('#');
    if (hashIndex === -1) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_ID_FORMAT,
        },
        { status: 400 }
      );
    }

    const tickerId = id.substring(hashIndex + 1);

    // Watchlist リポジトリを初期化
    const watchlistRepo = createWatchlistRepository();

    // ウォッチリストを削除
    await watchlistRepo.delete(userId, tickerId);

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json({
      success: true,
      deletedWatchlistId: `${userId}#${tickerId}`,
    });
  } catch (error) {
    console.error('Error deleting watchlist:', error);

    // WatchlistNotFoundError のハンドリング
    if (error instanceof Error && error.name === 'WatchlistNotFoundError') {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: ERROR_MESSAGES.NOT_FOUND,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}
