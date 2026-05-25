import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getVoicevoxClient } from '@/lib/server/voicevox';
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
 * Phase 1f のエコー API。受け取ったテキストをそのまま VOICEVOX に投げ、
 * 合成された WAV を返す。Phase 2 で LLM 統合に置き換わる。
 *
 * 認可: `livetalk:chat` permission を要求（middleware は /api をスキップするため、
 * route 側で withAuth する）。
 */
export const POST = withAuth(getSession, 'livetalk:chat', async (_session, request: Request) => {
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

  try {
    const audioBuffer = await getVoicevoxClient().synthesize(text);
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[POST /api/echo] VOICEVOX 合成に失敗しました', error);
    return NextResponse.json(
      { error: 'SYNTHESIS_FAILED', message: ECHO_ERROR_MESSAGES.SYNTHESIS_FAILED },
      { status: 502 }
    );
  }
});
