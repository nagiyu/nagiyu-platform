/**
 * Pagination Helper for Next.js API Routes
 *
 * Provides pagination utilities for Next.js API Routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { PaginatedResponse } from '@nagiyu/common';

/**
 * ページネーションパラメータ
 */
export interface PaginationParams {
  limit: number;
  /** クエリ `lastKey` の生の文字列。リポジトリの `PaginationOptions.cursor` にそのまま渡せる */
  cursor?: string;
}

/**
 * エラーメッセージ定数
 */
export const PAGINATION_ERROR_MESSAGES = {
  INVALID_LIMIT: 'limit は 1 から 100 の間で指定してください',
} as const;

export const PAGINATION_ERROR_CODES = {
  INVALID_LIMIT: 'INVALID_LIMIT',
} as const;

export type PaginationErrorCode =
  (typeof PAGINATION_ERROR_CODES)[keyof typeof PAGINATION_ERROR_CODES];

export class PaginationValidationError extends Error {
  public readonly code: PaginationErrorCode;

  constructor(message: string, code: PaginationErrorCode) {
    super(message);
    this.name = 'PaginationValidationError';
    this.code = code;
  }
}

/**
 * ページネーションパラメータをパース
 *
 * cursor はデコードせず生の文字列で返す。エンコード形式はリポジトリ側が持つため、
 * ここで解釈すると二重に変換することになる。
 *
 * @param request - Next.js リクエストオブジェクト
 * @returns ページネーションパラメータ (リポジトリの `PaginationOptions` としてそのまま渡せる)
 * @throws limit が無効な場合（1-100の範囲外）
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const pagination = parsePagination(request);
 *   const result = await repository.getByUserId(userId, pagination);
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
    throw new PaginationValidationError(
      PAGINATION_ERROR_MESSAGES.INVALID_LIMIT,
      PAGINATION_ERROR_CODES.INVALID_LIMIT
    );
  }

  return { limit, cursor: lastKeyParam || undefined };
}

/**
 * ページネーション付きレスポンスを作成
 *
 * @param items - レスポンスアイテムの配列
 * @param lastKey - 次のページのキー (リポジトリが返すエンコード済みの文字列をそのまま渡す)
 * @returns ページネーション情報を含むレスポンス
 *
 * @example
 * ```typescript
 * const result = await repository.getByUserId(userId, { limit: 50 });
 * return createPaginatedResponse(result.items, result.nextCursor);
 * ```
 */
export function createPaginatedResponse<T>(
  items: T[],
  lastKey?: string
): NextResponse<PaginatedResponse<T>> {
  return NextResponse.json({
    items,
    pagination: {
      count: items.length,
      ...(lastKey && { lastKey }),
    },
  });
}
