/**
 * Holdings API Endpoint
 *
 * GET /api/holdings - 保有株式一覧取得
 * POST /api/holdings - 保有株式登録
 *
 * Required Permission: stocks:write-own (POST), stocks:read (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { validateHolding } from '@nagiyu/stock-tracker-core';
import { withAuth, parsePagination, readJsonObjectBody } from '@nagiyu/nextjs';
import { createHoldingRepository, createTickerRepository } from '../../../lib/repository-factory';
import type { Session } from '@nagiyu/common';
import { getSession } from '../../../lib/auth';
import { withApiErrorReporting, reportSwallowedError } from '../../../lib/api-error-reporting';
import { isOptionalString } from '../../../lib/request-guards';
import type { Holding } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  VALIDATION_ERROR: '入力データが不正です',
  INTERNAL_ERROR: '保有株式の取得に失敗しました',
  CREATE_ERROR: '保有株式の登録に失敗しました',
  ALREADY_EXISTS: '指定された銘柄は既に保有株式として登録されています',
} as const;

/**
 * 握りつぶした例外の報告タイトル
 */
const REPORT_TITLES = {
  TICKER_LOOKUP: 'Web API: 保有株式一覧の銘柄情報取得エラー',
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

interface HoldingsListResponse {
  holdings: HoldingResponse[];
  pagination: {
    count: number;
    lastKey?: string;
  };
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
 * GET /api/holdings
 * 保有株式一覧取得
 */
export const GET = withAuth(
  getSession,
  'stocks:read',
  withApiErrorReporting(
    'Web API: 保有株式一覧取得エラー',
    async (session: Session, request: NextRequest) => {
      // リポジトリの初期化
      const holdingRepo = createHoldingRepository();

      // ユーザーIDを取得
      const userId = session!.user.id;

      // 保有株式一覧取得
      const result = await holdingRepo.getByUserId(userId, parsePagination(request));

      // TickerリポジトリでSymbolとNameを取得
      // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化
      const tickerRepo = createTickerRepository();

      const holdings: HoldingResponse[] = [];
      for (const holding of result.items) {
        // ティッカーが見つからない場合はデフォルト値を使用
        let ticker;
        try {
          ticker = await tickerRepo.getById(holding.TickerID);
        } catch (error) {
          // 銘柄名は付加情報のため、取得に失敗しても一覧は返す。握りつぶすので上位のラッパーでは拾えない
          await reportSwallowedError(REPORT_TITLES.TICKER_LOOKUP, error, {
            tickerId: holding.TickerID,
          });
          ticker = null;
        }
        holdings.push(
          mapHoldingToResponse(
            holding,
            ticker?.Symbol || holding.TickerID.split(':')[1] || '',
            ticker?.Name || ''
          )
        );
      }

      // レスポンス形式に変換
      const response: HoldingsListResponse = {
        holdings,
        pagination: {
          count: holdings.length,
          ...(result.nextCursor && { lastKey: result.nextCursor }),
        },
      };

      return NextResponse.json(response, { status: 200 });
    }
  )
);

/**
 * POST /api/holdings
 * 保有株式登録
 */
export const POST = withAuth(
  getSession,
  'stocks:write-own',
  withApiErrorReporting(
    'Web API: 保有株式登録エラー',
    async (session: Session, request: NextRequest) => {
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
      const {
        tickerId,
        exchangeId: requestedExchangeId,
        quantity,
        averagePrice,
        currency,
      } = bodyResult.body;

      // 文字列の項目は、バリデーションが文字列であることを前提にするため先に型を確かめる
      // (数量と価格の型違いはバリデーションが指摘する)
      if (
        !isOptionalString(tickerId) ||
        !isOptionalString(requestedExchangeId) ||
        !isOptionalString(currency)
      ) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.VALIDATION_ERROR,
          },
          { status: 400 }
        );
      }

      // ユーザーIDを取得
      const userId = session!.user.id;

      // 取引所IDは未指定ならティッカーID ({取引所}:{シンボル}) の先頭から補う
      const exchangeId = requestedExchangeId || tickerId?.split(':')[0] || '';

      // リクエストボディから Holding オブジェクトを構築
      const holdingData = {
        UserID: userId,
        TickerID: tickerId,
        ExchangeID: exchangeId,
        Quantity: quantity,
        AveragePrice: averagePrice,
        Currency: currency,
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      // バリデーション
      // 型の絞り込みも兼ねる (検証を通った値は期待する型だが、型システムには伝わらないため)
      const validationResult = validateHolding(holdingData);
      if (
        !validationResult.valid ||
        tickerId === undefined ||
        typeof quantity !== 'number' ||
        typeof averagePrice !== 'number' ||
        currency === undefined
      ) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.VALIDATION_ERROR,
            details: validationResult.errors,
          },
          { status: 400 }
        );
      }

      // リポジトリの初期化
      const holdingRepo = createHoldingRepository();

      // 保有株式を作成
      let createdHolding: Holding;
      try {
        createdHolding = await holdingRepo.create({
          UserID: userId,
          TickerID: tickerId,
          ExchangeID: exchangeId,
          Quantity: quantity,
          AveragePrice: averagePrice,
          Currency: currency,
        });
      } catch (error) {
        // HoldingAlreadyExistsError のチェック
        if (error instanceof Error && error.name === 'HoldingAlreadyExistsError') {
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: ERROR_MESSAGES.ALREADY_EXISTS,
            },
            { status: 400 }
          );
        }
        throw error;
      }

      // TickerリポジトリでSymbolとNameを取得
      const tickerRepo = createTickerRepository();
      const ticker = await tickerRepo.getById(createdHolding.TickerID);

      // レスポンス形式に変換
      const response = mapHoldingToResponse(
        createdHolding,
        ticker?.Symbol || createdHolding.TickerID.split(':')[1] || '',
        ticker?.Name || ''
      );

      return NextResponse.json(response, { status: 201 });
    }
  )
);
