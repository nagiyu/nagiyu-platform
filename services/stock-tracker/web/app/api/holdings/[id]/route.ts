/**
 * Holdings API Endpoint (by ID)
 *
 * PUT /api/holdings/[id] - 保有株式更新
 * DELETE /api/holdings/[id] - 保有株式削除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { EntityNotFoundError } from '@nagiyu/aws';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { createHoldingRepository, createTickerRepository } from '@nagiyu/stock-tracker-core';
import { getSession } from '../../../../lib/auth';
import { withApiErrorReporting } from '../../../../lib/api-error-reporting';
import type { HoldingEntity, UpdateHoldingInput } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_HOLDING_ID: '保有株式IDの形式が不正です',
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
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

/**
 * 項目の型が不正なときの 400 レスポンス
 *
 * 型違いの値を DB の更新へ渡さないために、保存前に弾く。
 */
function invalidFieldTypeResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'INVALID_REQUEST',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
    },
    { status: 400 }
  );
}

/**
 * Holding エンティティをレスポンス形式に変換
 */
function mapHoldingToResponse(
  holding: HoldingEntity,
  tickerSymbol: string,
  tickerName: string
): HoldingResponse {
  // HoldingID は UserID と TickerID の組み合わせ
  const holdingId = `${holding.userId}#${holding.tickerId}`;

  return {
    holdingId,
    tickerId: holding.tickerId,
    symbol: tickerSymbol,
    name: tickerName,
    quantity: holding.quantity,
    averagePrice: holding.averagePrice,
    currency: holding.currency,
    createdAt: new Date(holding.createdAt).toISOString(),
    updatedAt: new Date(holding.updatedAt).toISOString(),
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
export const PUT = withApiErrorReporting(
  'Web API: 保有株式更新エラー',
  withAuth(
    getSession,
    'stocks:write-own',
    async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
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
      const currentUserId = session.user.id;
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
      const { quantity, averagePrice, currency } = bodyResult.body;

      // 更新可能なフィールドのみ抽出
      const updates: UpdateHoldingInput = {};

      if (quantity !== undefined) {
        if (typeof quantity !== 'number') {
          return invalidFieldTypeResponse();
        }
        updates.quantity = quantity;
      }

      if (averagePrice !== undefined) {
        if (typeof averagePrice !== 'number') {
          return invalidFieldTypeResponse();
        }
        updates.averagePrice = averagePrice;
      }

      if (currency !== undefined) {
        if (typeof currency !== 'string') {
          return invalidFieldTypeResponse();
        }
        updates.currency = currency;
      }

      // 更新するフィールドがない場合はエラー
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: COMMON_ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED,
          },
          { status: 400 }
        );
      }

      // リポジトリの初期化
      const holdingRepo = createHoldingRepository();

      // 保有株式を更新
      let updatedHolding: HoldingEntity;
      try {
        updatedHolding = await holdingRepo.update(currentUserId, tickerId, updates);
      } catch (error) {
        // 保有株式が見つからない場合
        if (error instanceof EntityNotFoundError) {
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
      const tickerRepo = createTickerRepository();
      const ticker = await tickerRepo.getById(updatedHolding.tickerId);

      // レスポンス形式に変換
      const response = mapHoldingToResponse(
        updatedHolding,
        ticker?.symbol || updatedHolding.tickerId.split(':')[1] || '',
        ticker?.name || ''
      );

      return NextResponse.json(response, { status: 200 });
    }
  )
);

/**
 * DELETE /api/holdings/[id]
 * 保有株式削除
 */
export const DELETE = withApiErrorReporting(
  'Web API: 保有株式削除エラー',
  withAuth(
    getSession,
    'stocks:write-own',
    async (session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
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
      const currentUserId = session.user.id;
      if (targetUserId !== currentUserId) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: ERROR_MESSAGES.FORBIDDEN_ACCESS,
          },
          { status: 403 }
        );
      }

      // リポジトリの初期化
      const holdingRepo = createHoldingRepository();

      // 保有株式を削除
      try {
        await holdingRepo.delete(currentUserId, tickerId);
      } catch (error) {
        // 保有株式が見つからない場合
        if (error instanceof EntityNotFoundError) {
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
    }
  )
);
