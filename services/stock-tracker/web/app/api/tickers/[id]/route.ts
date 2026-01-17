/**
 * Ticker Management API - Single Ticker Operations
 *
 * PUT /api/tickers/{id} - ティッカー更新（stock-admin のみ）
 * DELETE /api/tickers/{id} - ティッカー削除（stock-admin のみ）
 *
 * Required Permission: stocks:manage-data
 */

import { NextRequest, NextResponse } from 'next/server';
import { TickerRepository, getAuthError } from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../../lib/dynamodb';
import { getSession } from '../../../../lib/auth';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  NAME_REQUIRED: '銘柄名は必須です',
  NAME_TOO_LONG: '銘柄名は200文字以内で入力してください',
  TICKER_NOT_FOUND: 'ティッカーが見つかりません',
  TICKER_UPDATE_FAILED: 'ティッカーの更新に失敗しました',
  TICKER_DELETE_FAILED: 'ティッカーの削除に失敗しました',
  RELATED_DATA_EXISTS: '関連するデータが存在するため削除できません',
} as const;

/**
 * PUT リクエストボディ型定義
 */
interface UpdateTickerRequest {
  name?: string;
}

/**
 * PUT レスポンス型定義
 */
interface UpdateTickerResponse {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
  updatedAt: string;
}

/**
 * DELETE レスポンス型定義
 */
interface DeleteTickerResponse {
  success: true;
  deletedTickerId: string;
}

/**
 * エラーレスポンス型定義
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * PUT /api/tickers/{id}
 * ティッカー更新（stock-admin のみ）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<UpdateTickerResponse | ErrorResponse>> {
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

    // パスパラメータの取得
    const { id: tickerId } = await params;

    // リクエストボディの取得
    const body: UpdateTickerRequest = await request.json();

    // バリデーション: Name
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
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
    }

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const tickerRepo = new TickerRepository(docClient, tableName);

    // ティッカー更新
    try {
      const updates: { Name?: string } = {};
      if (body.name !== undefined) {
        updates.Name = body.name;
      }

      const updatedTicker = await tickerRepo.update(tickerId, updates);

      // レスポンス形式に変換
      const response: UpdateTickerResponse = {
        tickerId: updatedTicker.TickerID,
        symbol: updatedTicker.Symbol,
        name: updatedTicker.Name,
        exchangeId: updatedTicker.ExchangeID,
        updatedAt: new Date(updatedTicker.UpdatedAt).toISOString(),
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      // ティッカーが見つからない場合
      if (error instanceof Error && error.message.includes('見つかりません')) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.TICKER_NOT_FOUND,
          },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error updating ticker:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.TICKER_UPDATE_FAILED,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tickers/{id}
 * ティッカー削除（stock-admin のみ）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<DeleteTickerResponse | ErrorResponse>> {
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

    // パスパラメータの取得
    const { id: tickerId } = await params;

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const tickerRepo = new TickerRepository(docClient, tableName);

    // ティッカー削除
    try {
      await tickerRepo.delete(tickerId);

      // レスポンス
      const response: DeleteTickerResponse = {
        success: true,
        deletedTickerId: tickerId,
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      // ティッカーが見つからない場合
      if (error instanceof Error && error.message.includes('見つかりません')) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.TICKER_NOT_FOUND,
          },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('Error deleting ticker:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.TICKER_DELETE_FAILED,
      },
      { status: 500 }
    );
  }
}
