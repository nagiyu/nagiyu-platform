import { NextResponse } from 'next/server';
import { ExchangeRepository, getAuthError } from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
import { getSession } from '../../../lib/auth';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INTERNAL_ERROR: '取引所一覧の取得に失敗しました',
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
