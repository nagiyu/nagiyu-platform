/**
 * Error Handler for Next.js API Routes
 *
 * Provides error handling utilities for Next.js API Routes.
 */

import { NextResponse } from 'next/server';
import type { ErrorResponse } from '@nagiyu/common';
import { ERROR_CODES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  NOT_FOUND: 'データが見つかりませんでした',
  ALREADY_EXISTS: '指定されたデータは既に存在しています',
  VALIDATION_ERROR: '入力データが不正です',
  INTERNAL_ERROR: '内部エラーが発生しました',
} as const;

/**
 * APIエラーをハンドリングしてNextResponseを返す
 *
 * エラーの種類に応じて適切なHTTPステータスコードとエラーレスポンスを返します。
 *
 * @param error - エラーオブジェクト
 * @returns エラーレスポンス
 *
 * @example
 * ```typescript
 * export async function GET() {
 *   try {
 *     const data = await repository.getById('123');
 *     return NextResponse.json(data);
 *   } catch (error) {
 *     return handleApiError(error);
 *   }
 * }
 * ```
 */
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  console.error('API Error:', error);

  // カスタムエラークラスの判定
  if (error instanceof Error) {
    // EntityNotFoundError → 404
    if (error.name.includes('NotFound')) {
      return NextResponse.json(
        { error: ERROR_CODES.NOT_FOUND, message: error.message || ERROR_MESSAGES.NOT_FOUND },
        { status: 404 }
      );
    }

    // EntityAlreadyExistsError → 400
    if (error.name.includes('AlreadyExists')) {
      return NextResponse.json(
        {
          error: ERROR_CODES.ALREADY_EXISTS,
          message: error.message || ERROR_MESSAGES.ALREADY_EXISTS,
        },
        { status: 400 }
      );
    }

    // InvalidEntityDataError → 400
    if (error.name.includes('Invalid')) {
      return NextResponse.json(
        {
          error: ERROR_CODES.VALIDATION_ERROR,
          message: error.message || ERROR_MESSAGES.VALIDATION_ERROR,
        },
        { status: 400 }
      );
    }
  }

  // デフォルト: 500 Internal Server Error
  return NextResponse.json(
    { error: ERROR_CODES.INTERNAL_ERROR, message: ERROR_MESSAGES.INTERNAL_ERROR },
    { status: 500 }
  );
}
