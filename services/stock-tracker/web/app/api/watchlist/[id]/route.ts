import { NextResponse } from 'next/server';
import { WatchlistRepository, getAuthError } from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../../lib/dynamodb';
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
 * IDの形式: {tickerId} (例: NSDQ:AAPL)
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
    const userId = session!.user.id;

    // パスパラメータからIDを取得
    const { id } = await params;

    // IDの形式チェック（TickerID: {Exchange.Key}:{Symbol}）
    if (!id || typeof id !== 'string' || !id.includes(':')) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_ID_FORMAT,
        },
        { status: 400 }
      );
    }

    const tickerId = id;

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    // Watchlist リポジトリを初期化
    const watchlistRepo = new WatchlistRepository(docClient, tableName);

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
