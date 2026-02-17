/**
 * Pagination Helper for Next.js API Routes
 *
 * Provides pagination utilities for Next.js API Routes.
 * Based on Stock Tracker's pagination implementation.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PaginatedResponse } from '@nagiyu/common';

/**
 * ページネーションパラメータ
 */
export interface PaginationParams {
  limit: number;
  lastKey?: Record<string, unknown>;
}

/**
 * エラーメッセージ定数
 */
const PAGINATION_ERROR_MESSAGES = {
  INVALID_LIMIT: 'limit は 1 から 100 の間で指定してください',
} as const;

/**
 * ページネーションパラメータをパース
 *
 * Stock Tracker の実装を標準化
 *
 * @param request - Next.js リクエストオブジェクト
 * @returns ページネーションパラメータ
 * @throws limit が無効な場合（1-100の範囲外）
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const { limit, lastKey } = parsePagination(request);
 *   const result = await repository.list({ limit, cursor: lastKey });
 *   return createPaginatedResponse(result.items, result.nextCursor);
 * }
 * ```
 */
export function parsePagination(request: NextRequest): PaginationParams {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const lastKeyParam = searchParams.get('lastKey');

  // limit のバリデーション (1-100)
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1 || limit > 100) {
    throw new Error(PAGINATION_ERROR_MESSAGES.INVALID_LIMIT);
  }

  // lastKey のデコード (base64)
  let lastKey: Record<string, unknown> | undefined;
  if (lastKeyParam) {
    try {
      lastKey = JSON.parse(Buffer.from(lastKeyParam, 'base64').toString('utf-8'));
    } catch {
      // 無効な lastKey は無視
      lastKey = undefined;
    }
  }

  return { limit, lastKey };
}

/**
 * ページネーション付きレスポンスを作成
 *
 * @param items - レスポンスアイテムの配列
 * @param lastKey - 次のページのキー（オプション）
 * @returns ページネーション情報を含むレスポンス
 *
 * @example
 * ```typescript
 * const result = await repository.list({ limit: 50 });
 * return createPaginatedResponse(result.items, result.nextCursor);
 * ```
 */
export function createPaginatedResponse<T>(
  items: T[],
  lastKey?: Record<string, unknown>
): NextResponse<PaginatedResponse<T>> {
  const encodedLastKey = lastKey
    ? Buffer.from(JSON.stringify(lastKey)).toString('base64')
    : undefined;

  return NextResponse.json({
    items,
    pagination: {
      count: items.length,
      ...(encodedLastKey && { lastKey: encodedLastKey }),
    },
  });
}
