import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  DEFAULT_CHARACTER_ID,
  LIVETALK_TERMS_VERSION,
  LIVETALK_PRIVACY_VERSION,
  isConsentValid,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getVoicevoxClient } from '@/lib/server/voicevox';
import { getMessageRepository, getProfileRepository } from '@/lib/server/repositories';
import { ECHO_ERROR_MESSAGES, ECHO_MAX_TEXT_LENGTH } from './constants';

interface EchoRequest {
  text: string;
}

function isEchoRequest(body: unknown): body is EchoRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Partial<EchoRequest>).text === 'string'
  );
}

/**
 * POST /api/echo
 *
 * Phase 1f で導入した「テキストをそのまま VOICEVOX に投げて WAV を返す」エコー API。
 *
 * Phase 2a の改修：
 * - リクエスト受信時にユーザー発話を DynamoDB に保存
 * - 応答返却前にキャラの応答（= 入力と同じテキスト）を DynamoDB に保存
 * - 認可は変わらず `livetalk:chat` permission を要求
 *
 * 永続化に失敗した場合は 5xx を返し、ユーザーに保存できなかったことを伝える
 * （UI ストリームから外れたまま黙って消えるよりは、見える壊れ方の方が良い）。
 * LLM 統合（Phase 2c）で `/api/chat` に置き換わるまでの暫定実装。
 */
export const POST = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: ECHO_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  if (!isEchoRequest(body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: ECHO_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  const text = body.text.trim();
  if (!text) {
    return NextResponse.json(
      { error: 'EMPTY_TEXT', message: ECHO_ERROR_MESSAGES.EMPTY_TEXT },
      { status: 400 }
    );
  }
  if (text.length > ECHO_MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_LONG', message: ECHO_ERROR_MESSAGES.TEXT_TOO_LONG },
      { status: 400 }
    );
  }

  const userId = session.user.googleId;
  const characterId = DEFAULT_CHARACTER_ID;

  const profile = await getProfileRepository().getById({ userId });
  if (!isConsentValid(profile?.Consents, {
    termsVersion: LIVETALK_TERMS_VERSION,
    privacyVersion: LIVETALK_PRIVACY_VERSION,
  })) {
    return NextResponse.json(
      { error: 'CONSENT_REQUIRED', message: ECHO_ERROR_MESSAGES.CONSENT_REQUIRED },
      { status: 403 }
    );
  }

  const messageRepository = getMessageRepository();

  try {
    await messageRepository.create({
      UserID: userId,
      CharacterID: characterId,
      Role: 'user',
      Text: text,
    });
  } catch (error) {
    console.error('[POST /api/echo] ユーザーメッセージの保存に失敗しました', error);
    return NextResponse.json(
      { error: 'PERSISTENCE_FAILED', message: ECHO_ERROR_MESSAGES.PERSISTENCE_FAILED },
      { status: 500 }
    );
  }

  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await getVoicevoxClient().synthesize(text);
  } catch (error) {
    console.error('[POST /api/echo] VOICEVOX 合成に失敗しました', error);
    return NextResponse.json(
      { error: 'SYNTHESIS_FAILED', message: ECHO_ERROR_MESSAGES.SYNTHESIS_FAILED },
      { status: 502 }
    );
  }

  try {
    await messageRepository.create({
      UserID: userId,
      CharacterID: characterId,
      Role: 'assistant',
      // Phase 2a 時点ではキャラの応答 = ユーザー入力（エコー）。
      Text: text,
    });
  } catch (error) {
    console.error('[POST /api/echo] キャラ応答メッセージの保存に失敗しました', error);
    return NextResponse.json(
      { error: 'PERSISTENCE_FAILED', message: ECHO_ERROR_MESSAGES.PERSISTENCE_FAILED },
      { status: 500 }
    );
  }

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
    },
  });
});
