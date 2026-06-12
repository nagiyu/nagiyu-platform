import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  CHAT_LOCK_TTL_MS,
  CHAT_RATE_LIMIT_PER_HOUR,
  CHAT_RATE_LIMIT_PER_MINUTE,
  CHAT_STREAM_TIMEOUT_MS,
  DEFAULT_CHARACTER_ID,
  defaultUlidFactory,
  runChatUseCase,
} from '@nagiyu/livetalk-core';
import { getCharacterDefinition, hasCharacter } from '@/lib/characters/registry';
import { getSession } from '@/lib/server/session';
import { getLLMClient } from '@/lib/server/llm';
import { getVoiceClient } from '@/lib/server/voice';
import {
  getCharacterStateRepository,
  getChatGuardRepository,
  getKnowledgeRepository,
  getLifecycleRepository,
  getMemoryRepository,
  getMemorySummaryRepository,
  getMessageRepository,
  getNoteRepository,
  getStudyTopicRepository,
} from '@/lib/server/repositories';
import { getModerationClient, getSafetyEventRepository } from '@/lib/server/safety';
import { getMemoryRetriever } from '@/lib/server/memory-retriever';
import { getEmbeddingClient } from '@/lib/server/embedding';
import { CHAT_ERROR_MESSAGES, CHAT_MAX_TEXT_LENGTH } from './constants';

interface ChatRequest {
  text: string;
  /** 通知起点の会話の場合、元となった KnowledgeID（任意） */
  knowledgeId?: string;
  /** キャラクター ID（省略時は DEFAULT_CHARACTER_ID を使用） */
  characterId?: string;
}

function isChatRequest(body: unknown): body is ChatRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Partial<ChatRequest>).text === 'string' &&
    ((body as Partial<ChatRequest>).knowledgeId === undefined ||
      typeof (body as Partial<ChatRequest>).knowledgeId === 'string') &&
    ((body as Partial<ChatRequest>).characterId === undefined ||
      typeof (body as Partial<ChatRequest>).characterId === 'string')
  );
}

/**
 * POST /api/chat
 *
 * ユーザー発話を受け取り、LLM 応答を NDJSON ストリームで返す（Phase 2c / Issue #3249）。
 *
 * ガード適用順（Issue #3528）:
 * 1. バリデーション（既存）
 * 2. レートリミットチェック（超過時は HTTP 429）
 * 3. in-flight ロック取得（取得失敗時は HTTP 429）
 * 4. ストリーム開始（AbortController によるサーバ側タイムアウト付き）
 * 5. finally でロック解放
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
  const notificationKnowledgeId = body.knowledgeId?.trim() || undefined;
  const characterId = body.characterId ?? DEFAULT_CHARACTER_ID;

  if (!hasCharacter(characterId)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CHAT_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

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
  const chatGuardRepository = getChatGuardRepository();
  const nowMs = Date.now();

  // ---- ガード 1: レートリミット ----
  // 1 分・1 時間の 2 ウィンドウをアトミックにインクリメントし、いずれか超過で 429 を返す。
  const [limitPerMinResult, limitPerHourResult] = await Promise.all([
    chatGuardRepository.incrementRateLimit(userId, '1m', nowMs),
    chatGuardRepository.incrementRateLimit(userId, '1h', nowMs),
  ]);

  if (
    limitPerMinResult.count > CHAT_RATE_LIMIT_PER_MINUTE ||
    limitPerHourResult.count > CHAT_RATE_LIMIT_PER_HOUR
  ) {
    return NextResponse.json(
      { error: 'RATE_LIMIT_EXCEEDED', message: CHAT_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED },
      {
        status: 429,
        headers: {
          // 1 分窓が超過している場合は次の分までの秒数、それ以外は次の時間までの秒数
          'Retry-After':
            limitPerMinResult.count > CHAT_RATE_LIMIT_PER_MINUTE
              ? String(60 - Math.floor((nowMs % 60_000) / 1000))
              : String(3600 - Math.floor((nowMs % 3_600_000) / 1000)),
        },
      }
    );
  }

  // ---- ガード 2: in-flight ロック取得 ----
  // 同一ユーザーの並行リクエストを 1 本に制限する。
  const ownerToken = defaultUlidFactory(nowMs);
  const lockResult = await chatGuardRepository.acquireLock(
    userId,
    ownerToken,
    CHAT_LOCK_TTL_MS,
    nowMs
  );

  if (!lockResult.acquired) {
    return NextResponse.json(
      { error: 'CONCURRENT_REQUEST', message: CHAT_ERROR_MESSAGES.CONCURRENT_REQUEST },
      { status: 429 }
    );
  }

  const encoder = new TextEncoder();

  // ---- ガード 3: ストリームのサーバ側タイムアウト ----
  // ECS セルフホストでは Next.js の maxDuration が効かないため、AbortController で制御する。
  // runChatUseCase は現時点では AbortSignal を受け取るシグネチャを持たないため、
  // ストリーム消費ループの外側にデッドラインを置いてループを抜ける方式とする。
  // （signal の受け渡しが大掛かりになるため、現段階では伝播させない。
  //   将来的に runChatUseCase が signal を受け取れるようになったら伝播を追加すること。）
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, CHAT_STREAM_TIMEOUT_MS);

  const stream = new ReadableStream({
    async start(controller) {
      const write = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        const eventGenerator = runChatUseCase({
          userId,
          characterId,
          userText: text,
          character: getCharacterDefinition(characterId),
          llmClient: getLLMClient(),
          voiceClient: getVoiceClient(),
          messageRepository: getMessageRepository(),
          safetyEventRepository: getSafetyEventRepository(),
          moderationClient: getModerationClient(),
          memoryRetriever: getMemoryRetriever(),
          memoryRepository: getMemoryRepository(),
          embeddingClient: getEmbeddingClient(),
          characterStateRepository: getCharacterStateRepository(),
          memorySummaryRepository: getMemorySummaryRepository(),
          lifecycleRepository: getLifecycleRepository(),
          knowledgeRepository: getKnowledgeRepository(),
          studyTopicRepository: getStudyTopicRepository(),
          noteRepository: getNoteRepository(),
          notificationKnowledgeId,
        });

        for await (const event of eventGenerator) {
          // タイムアウト到達時はループを抜けて error event を emit する
          if (abortController.signal.aborted) {
            write({ type: 'error', message: CHAT_ERROR_MESSAGES.STREAM_TIMEOUT });
            return;
          }
          write(event);
        }
      } catch (err) {
        if (abortController.signal.aborted) {
          // タイムアウト由来のエラーは STREAM_TIMEOUT メッセージで統一する
          write({ type: 'error', message: CHAT_ERROR_MESSAGES.STREAM_TIMEOUT });
        } else {
          console.error('[POST /api/chat] ストリーミング中にエラーが発生しました', err);
          write({ type: 'error', message: CHAT_ERROR_MESSAGES.INTERNAL_ERROR });
        }
      } finally {
        clearTimeout(timeoutId);
        // ownerToken が一致する場合のみロックを解放する。
        // ConditionalCheckFailed（他リクエストが既に奪取・解放済み）は releaseLock 側で握りつぶす。
        await chatGuardRepository.releaseLock(userId, ownerToken);
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
