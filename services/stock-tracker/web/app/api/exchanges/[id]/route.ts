import { NextResponse } from 'next/server';
import { validateExchange } from '@nagiyu/stock-tracker-core';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { createExchangeRepository } from '../../../../lib/repository-factory';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  UPDATE_ERROR: '取引所の更新に失敗しました',
  DELETE_ERROR: '取引所の削除に失敗しました',
  INVALID_REQUEST: 'リクエストが不正です',
  RELATED_TICKERS_EXIST: '関連するティッカーが存在するため削除できません',
} as const;

/**
 * GET /api/exchanges/{id} - 取引所取得
 *
 * 指定された取引所を取得します。
 *
 * 必要な権限: stocks:read
 *
 * @param request - Request オブジェクト
 * @param params - パスパラメータ
 * @returns 取引所情報 (200 OK)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns 取引所が見つからない (404 Not Found)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export const GET = withAuth(
  getSession,
  'stocks:read',
  async (_session, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: exchangeId } = await params;

      // Exchange リポジトリを初期化
      const exchangeRepo = createExchangeRepository();

      // 取引所を取得
      const exchange = await exchangeRepo.getById(exchangeId);

      if (!exchange) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      // レスポンスを返す (API仕様に従った形式)
      return NextResponse.json({
        exchangeId: exchange.ExchangeID,
        name: exchange.Name,
        key: exchange.Key,
        timezone: exchange.Timezone,
        tradingHours: {
          start: exchange.Start,
          end: exchange.End,
        },
        createdAt: new Date(exchange.CreatedAt).toISOString(),
        updatedAt: new Date(exchange.UpdatedAt).toISOString(),
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * PUT /api/exchanges/{id} - 取引所更新
 *
 * 取引所情報を更新します（stock-admin のみ）。
 *
 * 必要な権限: stocks:manage-data
 *
 * @param request - Request オブジェクト
 * @param params - パスパラメータ
 * @returns 更新された取引所 (200 OK)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns 取引所が見つからない (404 Not Found)
 * @returns リクエスト不正 (400 Bad Request)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export const PUT = withAuth(
  getSession,
  'stocks:manage-data',
  async (_session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: exchangeId } = await params;

      // Exchange リポジトリを初期化
      const exchangeRepo = createExchangeRepository();

      // 既存の取引所を取得
      const existingExchange = await exchangeRepo.getById(exchangeId);
      if (!existingExchange) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      // リクエストボディをパース
      const body = await request.json();

      // 更新可能なフィールドのみ抽出
      const updates: {
        Name?: string;
        Timezone?: string;
        Start?: string;
        End?: string;
      } = {};

      if (body.name !== undefined) {
        updates.Name = body.name;
      }

      if (body.timezone !== undefined) {
        updates.Timezone = body.timezone;
      }

      if (body.tradingHours?.start !== undefined) {
        updates.Start = body.tradingHours.start;
      }

      if (body.tradingHours?.end !== undefined) {
        updates.End = body.tradingHours.end;
      }

      // 更新フィールドが空の場合はエラー
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST,
          },
          { status: 400 }
        );
      }

      // 更新後のデータをバリデーション用にマージ
      const exchangeToValidate = {
        ...existingExchange,
        ...updates,
      };

      // バリデーション実行
      const validationResult = validateExchange(exchangeToValidate);

      if (!validationResult.valid) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: validationResult.errors?.join(', ') || ERROR_MESSAGES.INVALID_REQUEST,
          },
          { status: 400 }
        );
      }

      // 取引所を更新
      const updatedExchange = await exchangeRepo.update(exchangeId, updates);

      // レスポンスを返す (API仕様に従った形式)
      return NextResponse.json({
        exchangeId: updatedExchange.ExchangeID,
        name: updatedExchange.Name,
        key: updatedExchange.Key,
        timezone: updatedExchange.Timezone,
        tradingHours: {
          start: updatedExchange.Start,
          end: updatedExchange.End,
        },
        updatedAt: new Date(updatedExchange.UpdatedAt).toISOString(),
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * DELETE /api/exchanges/{id} - 取引所削除
 *
 * 取引所を削除します（stock-admin のみ）。
 *
 * 必要な権限: stocks:manage-data
 *
 * @param request - Request オブジェクト
 * @param params - パスパラメータ
 * @returns 削除成功 (200 OK)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns 取引所が見つからない (404 Not Found)
 * @returns 関連ティッカーあり (400 Bad Request)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export const DELETE = withAuth(
  getSession,
  'stocks:manage-data',
  async (_session, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: exchangeId } = await params;

      // Exchange リポジトリを初期化
      const exchangeRepo = createExchangeRepository();

      // 取引所を削除
      await exchangeRepo.delete(exchangeId);

      // レスポンスを返す (API仕様に従った形式)
      return NextResponse.json({
        success: true,
        deletedExchangeId: exchangeId,
      });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
