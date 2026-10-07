import { createErrorResponse } from '@nagiyu/nextjs';
import type { NextResponse } from 'next/server';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

/**
 * 400 VALIDATION_ERROR レスポンスを生成する。
 *
 * @param message - 既定以外の文言を返したい場合のみ指定する
 */
export function createValidationErrorResponse(
  message: string = ERROR_MESSAGES.VALIDATION_ERROR
): NextResponse {
  return createErrorResponse(400, 'VALIDATION_ERROR', message);
}

/** 404 NOT_FOUND レスポンスを生成する。 */
export function createNotFoundErrorResponse(): NextResponse {
  return createErrorResponse(404, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND);
}

/**
 * 403 レスポンスを生成する。
 *
 * @param code - OWNER_ONLY など FORBIDDEN 以外のコードを返したい場合のみ指定する
 * @param message - code に対応する文言
 */
export function createForbiddenErrorResponse(
  code: string = 'FORBIDDEN',
  message: string = ERROR_MESSAGES.FORBIDDEN
): NextResponse {
  return createErrorResponse(403, code, message);
}

/** 409 レスポンスを生成する。 */
export function createConflictErrorResponse(code: string, message: string): NextResponse {
  return createErrorResponse(409, code, message);
}

/** 500 INTERNAL_SERVER_ERROR レスポンスを生成する。 */
export function createInternalServerErrorResponse(): NextResponse {
  return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
}
