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
import { EntityAlreadyExistsError } from '@nagiyu/aws';
import {
  validateHolding,
  createHoldingRepository,
  createTickerRepository,
} from '@nagiyu/stock-tracker-core';
import { withAuth, parsePagination, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import { withApiErrorReporting, errorReporter } from '../../../lib/api-error-reporting';
import { isOptionalString } from '../../../lib/request-guards';
import type { HoldingEntity } from '@nagiyu/stock-tracker-core';

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
 * GET /api/holdings
 * 保有株式一覧取得
 */
export const GET = withApiErrorReporting(
  'Web API: 保有株式一覧取得エラー',
  withAuth(getSession, 'stocks:read', async (session, request: NextRequest) => {
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
        ticker = await tickerRepo.getById(holding.tickerId);
      } catch (error) {
        // 銘柄名は付加情報のため、取得に失敗しても一覧は返す。握りつぶすので上位のラッパーでは拾えない
        await errorReporter.report(REPORT_TITLES.TICKER_LOOKUP, error, {
          context: { tickerId: holding.tickerId },
        });
        ticker = null;
      }
      holdings.push(
        mapHoldingToResponse(
          holding,
          ticker?.symbol || holding.tickerId.split(':')[1] || '',
          ticker?.name || ''
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
  })
);

/**
 * POST /api/holdings
 * 保有株式登録
 */
export const POST = withApiErrorReporting(
  'Web API: 保有株式登録エラー',
  withAuth(getSession, 'stocks:write-own', async (session, request: NextRequest) => {
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
      userId,
      tickerId,
      exchangeId,
      quantity,
      averagePrice,
      currency,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
    let createdHolding: HoldingEntity;
    try {
      createdHolding = await holdingRepo.create({
        userId,
        tickerId,
        exchangeId,
        quantity,
        averagePrice,
        currency,
      });
    } catch (error) {
      // 同じ銘柄が既に保有株式として登録されている場合
      if (error instanceof EntityAlreadyExistsError) {
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
    const ticker = await tickerRepo.getById(createdHolding.tickerId);

    // レスポンス形式に変換
    const response = mapHoldingToResponse(
      createdHolding,
      ticker?.symbol || createdHolding.tickerId.split(':')[1] || '',
      ticker?.name || ''
    );

    return NextResponse.json(response, { status: 201 });
  })
);
