import { NextResponse } from 'next/server';
import { ExchangeRepository, getAuthError, validateExchange } from '@nagiyu/stock-tracker-core';
import { EntityAlreadyExistsError, InvalidEntityDataError } from '@nagiyu/aws';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
import { getSession } from '../../../lib/auth';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INTERNAL_ERROR: '取引所一覧の取得に失敗しました',
  CREATE_ERROR: '取引所の作成に失敗しました',
  INVALID_REQUEST: 'リクエストが不正です',
  EXCHANGE_ALREADY_EXISTS: '取引所は既に存在します',
} as const;

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
export async function GET() {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:read');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    // Exchange リポジトリを初期化
    const exchangeRepo = new ExchangeRepository(docClient, tableName);

    // 全取引所を取得
    const exchanges = await exchangeRepo.getAll();

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json({
      exchanges: exchanges.map((exchange) => ({
        exchangeId: exchange.ExchangeID,
        name: exchange.Name,
        key: exchange.Key,
        timezone: exchange.Timezone,
        tradingHours: {
          start: exchange.Start,
          end: exchange.End,
        },
      })),
    });
  } catch (error) {
    console.error('Error fetching exchanges:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_ERROR }, { status: 500 });
  }
}

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
 * @returns リクエスト不正 (400 Bad Request)
 * @returns サーバーエラー (500 Internal Server Error)
 */
export async function POST(request: Request) {
  try {
    // 認証・権限チェック
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

    // リクエストボディをパース
    const body = await request.json();

    // リクエストボディから Exchange オブジェクトを構築（バリデーション用）
    const { exchangeId, name, key, timezone, tradingHours } = body;

    // バリデーション用の一時的な Exchange オブジェクトを作成
    const exchangeToValidate = {
      ExchangeID: exchangeId,
      Name: name,
      Key: key,
      Timezone: timezone,
      Start: tradingHours?.start,
      End: tradingHours?.end,
      CreatedAt: Date.now(), // バリデーション用の仮値
      UpdatedAt: Date.now(), // バリデーション用の仮値
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

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBClient();
    const tableName = getTableName();

    // Exchange リポジトリを初期化
    const exchangeRepo = new ExchangeRepository(docClient, tableName);

    // 取引所を作成
    const newExchange = await exchangeRepo.create({
      ExchangeID: exchangeId,
      Name: name,
      Key: key,
      Timezone: timezone,
      Start: tradingHours.start,
      End: tradingHours.end,
    });

    // レスポンスを返す (API仕様に従った形式)
    return NextResponse.json(
      {
        exchangeId: newExchange.ExchangeID,
        name: newExchange.Name,
        key: newExchange.Key,
        timezone: newExchange.Timezone,
        tradingHours: {
          start: newExchange.Start,
          end: newExchange.End,
        },
        createdAt: new Date(newExchange.CreatedAt).toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating exchange:', error);

    // ExchangeAlreadyExistsError の場合は 400
    if (error instanceof ExchangeAlreadyExistsError) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.EXCHANGE_ALREADY_EXISTS,
        },
        { status: 400 }
      );
    }

    // InvalidEntityDataError の場合は 400
    if (error instanceof InvalidEntityDataError) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: ERROR_MESSAGES.CREATE_ERROR },
      { status: 500 }
    );
  }
}
