import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import { DEFAULT_CHARACTER_ID, hiyori, runChatUseCase } from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getLLMClient } from '@/lib/server/llm';
import { getVoicevoxClient } from '@/lib/server/voicevox';
import {
  getCharacterStateRepository,
  getKnowledgeRepository,
  getLifecycleRepository,
  getMemoryRepository,
  getMessageRepository,
  getStudyTopicRepository,
} from '@/lib/server/repositories';
import { getModerationClient, getSafetyEventRepository } from '@/lib/server/safety';
import { getMemoryRetriever } from '@/lib/server/memory-retriever';
import { getEmbeddingClient } from '@/lib/server/embedding';
import { CHAT_ERROR_MESSAGES, CHAT_MAX_TEXT_LENGTH } from './constants';

interface ChatRequest {
  text: string;
}

function isChatRequest(body: unknown): body is ChatRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Partial<ChatRequest>).text === 'string'
  );
}

/**
 * POST /api/chat
 *
 * ユーザー発話を受け取り、LLM 応答を NDJSON ストリームで返す（Phase 2c / Issue #3249）。
 *
 * レスポンス形式（1 行 1 JSON）:
 *   {"type":"text","delta":"こん"}
 *   {"type":"text","delta":"にちは。"}
 *   {"type":"sentence","index":0,"text":"こんにちは。","audio":"<base64 WAV>"}
 *   {"type":"done"}
 *
 * - text events: LLM ストリーミング中に逐次 emit
 * - sentence events: 文単位で VOICEVOX 合成完了後に emit（LLM 完了後、順番通り）
 * - done: ストリーム終了
 * - VOICEVOX エラー時は当該 sentence event をスキップ（テキストは既に表示済み）
 * - ストリーム開始後のエラーは error event で通知
 */
export const POST = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CHAT_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  if (!isChatRequest(body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CHAT_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  const text = body.text.trim();
  if (!text) {
    return NextResponse.json(
      { error: 'EMPTY_TEXT', message: CHAT_ERROR_MESSAGES.EMPTY_TEXT },
      { status: 400 }
    );
  }
  if (text.length > CHAT_MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_LONG', message: CHAT_ERROR_MESSAGES.TEXT_TOO_LONG },
      { status: 400 }
    );
  }

  const userId = session.user.googleId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const eventGenerator = runChatUseCase({
          userId,
          characterId: DEFAULT_CHARACTER_ID,
          userText: text,
          character: hiyori,
          llmClient: getLLMClient(),
          voiceClient: getVoicevoxClient(),
          messageRepository: getMessageRepository(),
          safetyEventRepository: getSafetyEventRepository(),
          moderationClient: getModerationClient(),
          memoryRetriever: getMemoryRetriever(),
          memoryRepository: getMemoryRepository(),
          embeddingClient: getEmbeddingClient(),
          characterStateRepository: getCharacterStateRepository(),
          lifecycleRepository: getLifecycleRepository(),
          knowledgeRepository: getKnowledgeRepository(),
          studyTopicRepository: getStudyTopicRepository(),
        });

        for await (const event of eventGenerator) {
          write(event);
        }
      } catch (err) {
        console.error('[POST /api/chat] ストリーミング中にエラーが発生しました', err);
        write({ type: 'error', message: CHAT_ERROR_MESSAGES.INTERNAL_ERROR });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
