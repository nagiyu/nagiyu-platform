import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import {
  validateExchange,
  type PriceSource,
  type ExchangeMarket,
} from '@nagiyu/stock-tracker-core';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { withApiErrorReporting } from '../../../../lib/api-error-reporting';
import { createExchangeRepository } from '../../../../lib/repository-factory';
import {
  isExchangeMarket,
  isOptionalString,
  isPriceSource,
  isRecord,
} from '../../../../lib/request-guards';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  EXCHANGE_NOT_FOUND: '取引所が見つかりません',
  UPDATE_ERROR: '取引所の更新に失敗しました',
  DELETE_ERROR: '取引所の削除に失敗しました',
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.BAD_REQUEST,
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  RELATED_TICKERS_EXIST: '関連するティッカーが存在するため削除できません',
  INVALID_PRICE_SOURCE:
    'データソースは "tradingview" または "finnhub" のいずれかを指定してください',
  INVALID_MARKET: '市場は "JP" または "US" のいずれかを指定してください',
} as const;

/**
 * リクエストボディが不正なときの 400 レスポンス
 */
function invalidRequestBodyResponse(): NextResponse {
  return NextResponse.json(
    { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_REQUEST_BODY },
    { status: 400 }
  );
}

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
  withApiErrorReporting(
    'Web API: 取引所取得エラー',
    async (_session, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
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
        priceSource: exchange.PriceSource,
        market: exchange.Market,
        createdAt: new Date(exchange.CreatedAt).toISOString(),
        updatedAt: new Date(exchange.UpdatedAt).toISOString(),
      });
    }
  )
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
  withApiErrorReporting(
    'Web API: 取引所更新エラー',
    async (_session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
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
      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return invalidRequestBodyResponse();
      }
      const { name, timezone, tradingHours, priceSource, market } = bodyResult.body;

      // priceSource のバリデーション（指定された場合のみ）
      if (priceSource !== undefined && !isPriceSource(priceSource)) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_PRICE_SOURCE },
          { status: 400 }
        );
      }

      // market のバリデーション（指定された場合のみ。null は未設定に戻す指定として許容する）
      if (market !== undefined && market !== null && !isExchangeMarket(market)) {
        return NextResponse.json(
          { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_MARKET },
          { status: 400 }
        );
      }

      // 各項目の型チェック
      const hours = tradingHours === undefined ? {} : tradingHours;
      if (!isRecord(hours)) {
        return invalidRequestBodyResponse();
      }
      const { start, end } = hours;
      if (
        !isOptionalString(name) ||
        !isOptionalString(timezone) ||
        !isOptionalString(start) ||
        !isOptionalString(end)
      ) {
        return invalidRequestBodyResponse();
      }

      // 更新可能なフィールドのみ抽出
      const updates: {
        Name?: string;
        Timezone?: string;
        Start?: string;
        End?: string;
        PriceSource?: PriceSource;
        Market?: ExchangeMarket | null;
      } = {};

      if (name !== undefined) {
        updates.Name = name;
      }

      if (timezone !== undefined) {
        updates.Timezone = timezone;
      }

      if (start !== undefined) {
        updates.Start = start;
      }

      if (end !== undefined) {
        updates.End = end;
      }

      if (priceSource !== undefined) {
        updates.PriceSource = priceSource;
      }

      // market は undefined（更新しない）・null（未設定に戻す）・値（設定）の3値を区別する
      if (market !== undefined) {
        updates.Market = market;
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
        priceSource: updatedExchange.PriceSource,
        market: updatedExchange.Market,
        updatedAt: new Date(updatedExchange.UpdatedAt).toISOString(),
      });
    }
  )
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
  withApiErrorReporting(
    'Web API: 取引所削除エラー',
    async (_session, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
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
    }
  )
);
