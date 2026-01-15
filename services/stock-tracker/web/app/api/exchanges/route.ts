import { NextResponse } from 'next/server';
import { hasPermission } from '@nagiyu/common';
import { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { getDynamoDBDocClient, getDynamoDBTableName } from '../../../lib/aws-clients';
import { getSession } from '../../../lib/auth/session';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
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
    // 認証チェック
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
    }

    // 権限チェック (stocks:read 必須)
    if (!hasPermission(session.user.roles, 'stocks:read')) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.FORBIDDEN,
          details: 'Required permission: stocks:read',
        },
        { status: 403 }
      );
    }

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBDocClient();
    const tableName = getDynamoDBTableName();

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
