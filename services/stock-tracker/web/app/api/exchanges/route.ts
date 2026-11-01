import { NextResponse } from 'next/server';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import {
  validateExchange,
  type ExchangeEntity,
  DEFAULT_PRICE_SOURCE,
  type PriceSource,
  createExchangeRepository,
} from '@nagiyu/stock-tracker-core';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../lib/auth';
import { withApiErrorReporting } from '../../../lib/api-error-reporting';
import {
  isExchangeMarket,
  isOptionalString,
  isPriceSource,
  isRecord,
} from '../../../lib/request-guards';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INTERNAL_ERROR: '取引所一覧の取得に失敗しました',
  CREATE_ERROR: '取引所の作成に失敗しました',
  INVALID_REQUEST: COMMON_ERROR_MESSAGES.BAD_REQUEST,
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  EXCHANGE_ALREADY_EXISTS: '取引所は既に存在します',
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
 * GET /api/exchanges - 取引所一覧取得
 *
 * 登録されている全取引所を取得します。
 *
 * 必要な権限: stocks:read
 *
 * @returns 取引所一覧 (200 OK)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export const GET = withApiErrorReporting(
  'Web API: 取引所一覧取得エラー',
  withAuth(getSession, 'stocks:read', async () => {
    // Exchange リポジトリを初期化
    const exchangeRepo = createExchangeRepository();

    // 全取引所を取得
    const exchanges = await exchangeRepo.getAll();

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json({
      exchanges: exchanges.map((exchange: ExchangeEntity) => ({
        exchangeId: exchange.exchangeId,
        name: exchange.name,
        key: exchange.key,
        timezone: exchange.timezone,
        tradingHours: {
          start: exchange.start,
          end: exchange.end,
        },
        priceSource: exchange.priceSource,
        market: exchange.market,
      })),
    });
  })
);

/**
 * POST /api/exchanges - 取引所作成
 *
 * 新しい取引所を登録します（stock-admin のみ）。
 *
 * 必要な権限: stocks:manage-data
 *
 * @returns 作成された取引所 (201 Created)
 * @returns 認証エラー (401 Unauthorized)
 * @returns 権限エラー (403 Forbidden)
 * @returns リクエスト不正、または同じ取引所IDが既に存在する (400 Bad Request)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export const POST = withApiErrorReporting(
  'Web API: 取引所作成エラー',
  withAuth(getSession, 'stocks:manage-data', async (_session, request: Request) => {
    // リクエストボディをパース
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return invalidRequestBodyResponse();
    }

    // リクエストボディから Exchange オブジェクトを構築（バリデーション用）
    const { exchangeId, name, key, timezone, tradingHours, priceSource, market } = bodyResult.body;

    // priceSource のバリデーション（指定された場合のみ）
    if (priceSource !== undefined && !isPriceSource(priceSource)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_PRICE_SOURCE },
        { status: 400 }
      );
    }

    // market のバリデーション（指定された場合のみ。省略可能で、デフォルト値は持たない）
    if (market !== undefined && !isExchangeMarket(market)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.INVALID_MARKET },
        { status: 400 }
      );
    }

    // 各項目の型チェック（必須かどうかは後段の validateExchange が判定する）
    const hours = tradingHours === undefined ? {} : tradingHours;
    if (!isRecord(hours)) {
      return invalidRequestBodyResponse();
    }
    const { start, end } = hours;
    if (
      !isOptionalString(exchangeId) ||
      !isOptionalString(name) ||
      !isOptionalString(key) ||
      !isOptionalString(timezone) ||
      !isOptionalString(start) ||
      !isOptionalString(end)
    ) {
      return invalidRequestBodyResponse();
    }

    // 解決済みの PriceSource（未指定時はデフォルト値を使用）
    const resolvedPriceSource: PriceSource =
      priceSource !== undefined ? priceSource : DEFAULT_PRICE_SOURCE;

    // バリデーション用の一時的な Exchange オブジェクトを作成
    const exchangeToValidate = {
      exchangeId,
      name,
      key,
      timezone,
      start,
      end,
      priceSource: resolvedPriceSource,
      market,
      createdAt: Date.now(), // バリデーション用の仮値
      updatedAt: Date.now(), // バリデーション用の仮値
    };

    // バリデーション実行
    // 未指定の項目の絞り込みも兼ねる (検証を通った値は必須項目が揃っているが、型システムには伝わらないため)
    const validationResult = validateExchange(exchangeToValidate);

    if (
      !validationResult.valid ||
      exchangeId === undefined ||
      name === undefined ||
      key === undefined ||
      timezone === undefined ||
      start === undefined ||
      end === undefined
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: validationResult.errors?.join(', ') || ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    // Exchange リポジトリを初期化
    const exchangeRepo = createExchangeRepository();

    // 取引所を作成
    // 同じ取引所IDが既に存在すると EntityAlreadyExistsError が上に届き、
    // ルート入口のラッパーが ALREADY_EXISTS の 400 に変換する。
    const newExchange = await exchangeRepo.create({
      exchangeId,
      name,
      key,
      timezone,
      start,
      end,
      priceSource: resolvedPriceSource,
      market,
    });

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json(
      {
        exchangeId: newExchange.exchangeId,
        name: newExchange.name,
        key: newExchange.key,
        timezone: newExchange.timezone,
        tradingHours: {
          start: newExchange.start,
          end: newExchange.end,
        },
        priceSource: newExchange.priceSource,
        market: newExchange.market,
        createdAt: new Date(newExchange.createdAt).toISOString(),
      },
      { status: 201 }
    );
  })
);
