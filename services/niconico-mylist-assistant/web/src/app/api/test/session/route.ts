import { NextResponse } from 'next/server';
import { createNiconicoCredentialRepository } from '@nagiyu/niconico-mylist-assistant-core';
import { getSession } from '@/lib/auth/session';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

/**
 * テスト環境かどうかを判定する
 *
 * USE_IN_MEMORY_DB=true のときのみテストエンドポイントを有効化する。
 * 本番環境では 404 を返す。
 */
function isTestMode(): boolean {
  return process.env.USE_IN_MEMORY_DB === 'true';
}

/**
 * POST /api/test/session
 * ログインユーザーのニコニコ資格情報をダミーブロブで seed する（テスト専用）
 *
 * 本番環境では 404 を返す（USE_IN_MEMORY_DB=true のときのみ有効）。
 * 実際の暗号化は行わない（E2E 環境では AWS 不可）。
 * encryptedUserSession にはプレースホルダを直接書き込む。
 * register エンドポイントはこのブロブを ENCRYPTED_USER_SESSION として Batch に渡すだけであり、
 * E2E では Batch 投入が失敗するため中身の正当性は不要。
 */
export async function POST() {
  if (!isTestMode()) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.TEST_ENDPOINT_NOT_AVAILABLE },
      { status: 404 }
    );
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const repo = createNiconicoCredentialRepository();

    // ダミーブロブ（register が ENCRYPTED_USER_SESSION として Batch に渡す形式）
    // 実際の暗号化は行わない（E2E 環境では AWS KMS が使用不可）
    const encryptedUserSession = JSON.stringify({
      ciphertext: 'dummy',
      iv: 'dummy',
      authTag: 'dummy',
    });

    const now = Date.now();
    // セッション有効期間は 30 日
    const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    await repo.upsert({
      userId: session.user.userId,
      encryptedUserSession,
      acquiredAt: now,
      estimatedExpiresAt: now + SESSION_TTL_MS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('テスト用セッション seed エラー:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

/**
 * DELETE /api/test/session
 * seed した資格情報を削除する（クリーンアップ用、テスト専用）
 *
 * 本番環境では 404 を返す（USE_IN_MEMORY_DB=true のときのみ有効）。
 */
export async function DELETE() {
  if (!isTestMode()) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.TEST_ENDPOINT_NOT_AVAILABLE },
      { status: 404 }
    );
  }

  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: ERROR_MESSAGES.UNAUTHORIZED }, { status: 401 });
  }

  try {
    const repo = createNiconicoCredentialRepository();
    await repo.delete(session.user.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('テスト用セッション削除エラー:', error);
    return NextResponse.json({ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}
