/**
 * GET/POST/DELETE /api/niconico/session
 *
 * ニコニコセッション管理 API
 *
 * GET    - 保存セッションの状態を取得
 * POST   - セッションを検証して保存/更新
 * DELETE - 保存セッションを削除
 */

import { NextRequest, NextResponse } from 'next/server';
import type { CryptoConfig } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  getNiconicoSessionStatus,
  saveNiconicoSession,
  deleteNiconicoSession,
  InvalidSessionError,
  IndeterminateSessionError,
} from '@/lib/niconico-session';
import type { ErrorResponse } from '@nagiyu/common';
import { toErrorMessage } from '@nagiyu/common';

/**
 * セッション状態レスポンスの型定義
 */
interface SessionStatusResponse {
  hasSession: boolean;
  validity: 'valid' | 'invalid' | 'unknown' | undefined;
  acquiredAt: number | undefined;
  estimatedExpiresAt: number | undefined;
}

/**
 * セッション保存レスポンスの型定義
 */
interface SessionSaveResponse {
  message: string;
  acquiredAt: number;
  estimatedExpiresAt: number;
}

/**
 * セッション削除レスポンスの型定義
 */
interface SessionDeleteResponse {
  message: string;
}

const SUCCESS_MESSAGES = {
  SESSION_SAVED: 'ニコニコセッションを保存しました',
  SESSION_DELETED: 'ニコニコセッションを削除しました',
} as const;

/**
 * 環境変数から暗号化設定を取得
 */
function getCryptoConfig(): CryptoConfig {
  return {
    secretName: process.env.ENCRYPTION_SECRET_NAME || process.env.SHARED_SECRET_KEY || '',
    region: process.env.AWS_REGION_FOR_SDK || process.env.AWS_REGION || 'us-east-1',
  };
}

/**
 * GET /api/niconico/session
 * 保存済みセッションの状態を取得
 */
export async function GET(): Promise<NextResponse<SessionStatusResponse | ErrorResponse>> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 }
    );
  }

  try {
    const cryptoConfig = getCryptoConfig();
    const status = await getNiconicoSessionStatus(session.user.userId, cryptoConfig);
    return NextResponse.json(status);
  } catch (error) {
    // 復号エラーはクッキー値を含まないメッセージのみログ出力
    console.error('ニコニコセッション状態取得エラー:', toErrorMessage(error));
    return NextResponse.json(
      {
        error: 'SESSION_STATUS_ERROR',
        message: ERROR_MESSAGES.NICONICO_SESSION_STATUS_FETCH_FAILED,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/niconico/session
 * セッションを検証して保存/更新
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SessionSaveResponse | ErrorResponse>> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 }
    );
  }

  try {
    // リクエストボディのパース（不正 JSON は 400 で返す）
    let body: { userSession?: unknown };
    try {
      body = (await request.json()) as { userSession?: unknown };
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST_BODY', message: ERROR_MESSAGES.INVALID_REQUEST_BODY },
        { status: 400 }
      );
    }

    if (!body.userSession) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.USER_SESSION_REQUIRED },
        { status: 400 }
      );
    }

    if (typeof body.userSession !== 'string') {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: ERROR_MESSAGES.USER_SESSION_MUST_BE_STRING },
        { status: 400 }
      );
    }

    const cryptoConfig = getCryptoConfig();
    const { acquiredAt, estimatedExpiresAt } = await saveNiconicoSession(
      session.user.userId,
      body.userSession,
      cryptoConfig
    );

    return NextResponse.json({
      message: SUCCESS_MESSAGES.SESSION_SAVED,
      acquiredAt,
      estimatedExpiresAt,
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return NextResponse.json(
        { error: 'INVALID_SESSION', message: ERROR_MESSAGES.NICONICO_SESSION_INVALID },
        { status: 400 }
      );
    }

    if (error instanceof IndeterminateSessionError) {
      return NextResponse.json(
        {
          error: 'INDETERMINATE_SESSION',
          message: ERROR_MESSAGES.NICONICO_SESSION_VALIDATION_INDETERMINATE,
        },
        { status: 400 }
      );
    }

    console.error('ニコニコセッション保存エラー:', toErrorMessage(error));
    return NextResponse.json(
      { error: 'SESSION_SAVE_ERROR', message: ERROR_MESSAGES.NICONICO_SESSION_SAVE_FAILED },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/niconico/session
 * 保存済みセッションを削除
 */
export async function DELETE(): Promise<NextResponse<SessionDeleteResponse | ErrorResponse>> {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: ERROR_MESSAGES.UNAUTHORIZED },
      { status: 401 }
    );
  }

  try {
    await deleteNiconicoSession(session.user.userId);
    return NextResponse.json({ message: SUCCESS_MESSAGES.SESSION_DELETED });
  } catch (error) {
    console.error('ニコニコセッション削除エラー:', toErrorMessage(error));
    return NextResponse.json(
      { error: 'SESSION_DELETE_ERROR', message: ERROR_MESSAGES.NICONICO_SESSION_DELETE_FAILED },
      { status: 500 }
    );
  }
}
