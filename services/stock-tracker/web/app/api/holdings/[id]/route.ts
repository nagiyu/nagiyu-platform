/**
 * Holdings API Endpoint (by ID)
 *
 * PUT /api/holdings/[id] - 保有株式更新
 * DELETE /api/holdings/[id] - 保有株式削除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthError,
  DynamoDBHoldingRepository,
  DynamoDBTickerRepository,
  type Holding,
} from '@nagiyu/stock-tracker-core';
import { withRepository, withRepositories } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { getDynamoDBClient, getTableName } from '../../../../lib/dynamodb';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_HOLDING_ID: '保有株式IDの形式が不正です',
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  VALIDATION_ERROR: '入力データが不正です',
  HOLDING_NOT_FOUND: '保有株式が見つかりません',
  FORBIDDEN_ACCESS: '他のユーザーの保有株式にはアクセスできません',
  UPDATE_ERROR: '保有株式の更新に失敗しました',
  DELETE_ERROR: '保有株式の削除に失敗しました',
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

interface DeleteResponse {
  success: boolean;
  deletedHoldingId: string;
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
 * HoldingID をパースして UserID と TickerID を取得
 *
 * @param holdingId - 保有株式ID（形式: {UserID}#{TickerID}）
 * @returns { userId, tickerId } または null（パースに失敗した場合）
 */
function parseHoldingId(holdingId: string): { userId: string; tickerId: string } | null {
  const parts = holdingId.split('#');
  if (parts.length !== 2) {
    return null;
  }
  return {
    userId: parts[0],
    tickerId: parts[1],
  };
}

/**
 * PUT /api/holdings/[id]
 * 保有株式更新
 */
export const PUT = withRepositories(
  getDynamoDBClient,
  getTableName,
  [DynamoDBHoldingRepository, DynamoDBTickerRepository],
  async (
    [holdingRepo, tickerRepo],
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
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

      // paramsを await で取得 (Next.js 15+)
      const resolvedParams = await params;

      // HoldingID をパース
      const holdingId = resolvedParams.id;
      const parsedId = parseHoldingId(holdingId);
      if (!parsedId) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_HOLDING_ID,
          },
          { status: 400 }
        );
      }

      const { userId: targetUserId, tickerId } = parsedId;

      // 他ユーザーのデータへのアクセスを拒否
      const currentUserId = session!.user.userId;
      if (targetUserId !== currentUserId) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: ERROR_MESSAGES.FORBIDDEN_ACCESS,
          },
          { status: 403 }
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

      // 更新可能なフィールドのみ抽出
      const updates: Partial<Pick<Holding, 'Quantity' | 'AveragePrice' | 'Currency'>> = {};

      if (body.quantity !== undefined) {
        updates.Quantity = body.quantity;
      }

      if (body.averagePrice !== undefined) {
        updates.AveragePrice = body.averagePrice;
      }

      if (body.currency !== undefined) {
        updates.Currency = body.currency;
      }

      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: '更新するフィールドが指定されていません',
          },
          { status: 400 }
        );
      }

      // 保有株式を更新
      let updatedHolding: Holding;
      try {
        updatedHolding = await holdingRepo.update(currentUserId, tickerId, updates);
      } catch (error) {
        // HoldingNotFoundError のチェック
        if (error instanceof Error && error.name === 'HoldingNotFoundError') {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              message: ERROR_MESSAGES.HOLDING_NOT_FOUND,
            },
            { status: 404 }
          );
        }
        throw error;
      }

      // TickerリポジトリでSymbolとNameを取得
      const ticker = await tickerRepo.getById(updatedHolding.TickerID);

      // レスポンス形式に変換
      const response = mapHoldingToResponse(
        updatedHolding,
        ticker?.Symbol || updatedHolding.TickerID.split(':')[1] || '',
        ticker?.Name || ''
      );

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      console.error('Error updating holding:', error);
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.UPDATE_ERROR,
        },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/holdings/[id]
 * 保有株式削除
 */
export const DELETE = withRepository(
  getDynamoDBClient,
  getTableName,
  DynamoDBHoldingRepository,
  async (
    holdingRepo,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
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

      // paramsを await で取得 (Next.js 15+)
      const resolvedParams = await params;

      // HoldingID をパース
      const holdingId = resolvedParams.id;
      const parsedId = parseHoldingId(holdingId);
      if (!parsedId) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_HOLDING_ID,
          },
          { status: 400 }
        );
      }

      const { userId: targetUserId, tickerId } = parsedId;

      // 他ユーザーのデータへのアクセスを拒否
      const currentUserId = session!.user.userId;
      if (targetUserId !== currentUserId) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: ERROR_MESSAGES.FORBIDDEN_ACCESS,
          },
          { status: 403 }
        );
      }

      // 保有株式を削除
      try {
        await holdingRepo.delete(currentUserId, tickerId);
      } catch (error) {
        // HoldingNotFoundError のチェック
        if (error instanceof Error && error.name === 'HoldingNotFoundError') {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              message: ERROR_MESSAGES.HOLDING_NOT_FOUND,
            },
            { status: 404 }
          );
        }
        throw error;
      }

      // レスポンスを返す
      const response: DeleteResponse = {
        success: true,
        deletedHoldingId: holdingId,
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      console.error('Error deleting holding:', error);
      return NextResponse.json(
        {
          error: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES.DELETE_ERROR,
        },
        { status: 500 }
      );
    }
  }
);
