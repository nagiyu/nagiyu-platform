/**
 * 取引所一覧 API
 *
 * GET /api/exchanges - 全取引所を取得
 *
 * 必要な権限: stocks:read
 */

import { NextResponse } from 'next/server';
import { auth } from '../../../src/auth';
import { hasPermission } from '@nagiyu/common';
import { ExchangeRepository } from '@nagiyu/stock-tracker-core';
import { getDynamoDBDocumentClient, getTableName } from '../../../src/lib/aws-clients';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  INTERNAL_ERROR: '内部エラーが発生しました',
} as const;

/**
 * GET /api/exchanges
 *
 * 全取引所を取得
 *
 * @returns 取引所一覧
 */
export async function GET() {
  try {
    // 認証チェック
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
        { status: 401 }
      );
    }

    // 権限チェック (stocks:read)
    const userRoles = session.user.roles || [];
    if (!hasPermission(userRoles, 'stocks:read')) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN },
        { status: 403 }
      );
    }

    // DynamoDB クライアントとテーブル名を取得
    const docClient = getDynamoDBDocumentClient();
    const tableName = getTableName();

    // Exchange リポジトリを初期化
    const exchangeRepository = new ExchangeRepository(docClient, tableName);

    // 全取引所を取得
    const exchanges = await exchangeRepository.getAll();

    // API 仕様に従ったレスポンス形式
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
    console.error('取引所一覧取得エラー:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}
