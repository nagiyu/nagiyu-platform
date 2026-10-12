/**
 * Ticker Management API - Single Ticker Operations
 *
 * PUT /api/tickers/{id} - ティッカー更新（stock-admin のみ）
 * DELETE /api/tickers/{id} - ティッカー削除（stock-admin のみ）
 *
 * Required Permission: stocks:manage-data
 */

import { NextRequest, NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { TickerNotFoundError, validateTickerUpdateData } from '@nagiyu/stock-tracker-core';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { withApiErrorReporting } from '../../../../lib/api-error-reporting';
import { createTickerRepository } from '../../../../lib/repository-factory';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  TICKER_NOT_FOUND: 'ティッカーが見つかりません',
  TICKER_UPDATE_FAILED: 'ティッカーの更新に失敗しました',
  TICKER_DELETE_FAILED: 'ティッカーの削除に失敗しました',
  RELATED_DATA_EXISTS: '関連するデータが存在するため削除できません',
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
} as const;

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
 * PUT /api/tickers/{id}
 * ティッカー更新（stock-admin のみ）
 */
export const PUT = withApiErrorReporting(
  'Web API: ティッカー更新エラー',
  withAuth(
    getSession,
    'stocks:manage-data',
    async (_session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
      // パスパラメータの取得
      const { id: tickerId } = await params;

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
      const { name } = bodyResult.body;

      // バリデーション
      // 型の絞り込みも兼ねる (検証を通った値は文字列だが、型システムには伝わらないため)
      const validationResult = validateTickerUpdateData(bodyResult.body);
      if (!validationResult.valid || typeof name !== 'string') {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: validationResult.errors?.[0] || 'バリデーションエラー',
          },
          { status: 400 }
        );
      }

      // リポジトリを初期化
      const tickerRepo = createTickerRepository();

      // ティッカー更新
      try {
        const updatedTicker = await tickerRepo.update(tickerId, {
          Name: name,
        });

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
        if (error instanceof TickerNotFoundError) {
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
    }
  )
);

/**
 * DELETE /api/tickers/{id}
 * ティッカー削除（stock-admin のみ）
 */
export const DELETE = withApiErrorReporting(
  'Web API: ティッカー削除エラー',
  withAuth(
    getSession,
    'stocks:manage-data',
    async (_session, request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
      // パスパラメータの取得
      const { id: tickerId } = await params;

      // リポジトリを初期化
      const tickerRepo = createTickerRepository();

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
        if (error instanceof TickerNotFoundError) {
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
    }
  )
);
