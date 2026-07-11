import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  CHAT_LOCK_TTL_MS,
  CHAT_RATE_LIMIT_PER_HOUR,
  CHAT_RATE_LIMIT_PER_MINUTE,
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
import { getTopicRetriever } from '@/lib/server/topic-retriever';
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
 * 2. in-flight ロック取得（取得失敗時は HTTP 429、DB 障害時はフェイルオープンで通す）
 * 3. レートリミットチェック（超過時は HTTP 429、DB 障害時はフェイルオープンで通す）
 * 4. ストリーム開始
 * 5. finally でロック解放（取得できた場合のみ）
 *
 * サーバ側タイムアウトは上流クライアントのタイムアウトに委譲する設計
 * （route 層に決定論的な上限は持たない）。
 * 上流タイムアウトによるエラーも catch で INTERNAL_ERROR として emit される。
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

  // ---- ガード 1: in-flight ロック取得 ----
  // 同一ユーザーの並行リクエストを 1 本に制限する。
  // DynamoDB 障害時はフェイルオープン（ロック無しで続行）し、警告ログを残す。
  const ownerToken = defaultUlidFactory(nowMs);
  let lockAcquired = false;

  let lockResult;
  try {
    lockResult = await chatGuardRepository.acquireLock(userId, ownerToken, CHAT_LOCK_TTL_MS, nowMs);
  } catch (lockErr) {
    // DynamoDB 障害: フェイルオープン（ロック無しで続行する）
    console.warn(
      '[POST /api/chat] ロック取得に失敗したためバイパスしました。障害時フェイルオープン。',
      lockErr
    );
    lockResult = null;
  }

  if (lockResult !== null) {
    if (!lockResult.acquired) {
      return NextResponse.json(
        { error: 'CONCURRENT_REQUEST', message: CHAT_ERROR_MESSAGES.CONCURRENT_REQUEST },
        { status: 429 }
      );
    }
    lockAcquired = true;
  }

  // ---- ガード 2: レートリミット ----
  // 1 分・1 時間の 2 ウィンドウをアトミックにインクリメントし、いずれか超過で 429 を返す。
  // ロック取得後にチェックすることで、並行リクエスト（ロック競合で 429 拒否）が
  // レートカウンタを消費しないようにする。
  // DynamoDB 障害時はフェイルオープン（レート超過扱いにせず通す）し、警告ログを残す。
  let limitPerMinResult;
  let limitPerHourResult;
  try {
    [limitPerMinResult, limitPerHourResult] = await Promise.all([
      chatGuardRepository.incrementRateLimit(userId, '1m', nowMs),
      chatGuardRepository.incrementRateLimit(userId, '1h', nowMs),
    ]);
  } catch (rateErr) {
    // DynamoDB 障害: フェイルオープン（レートリミットをバイパスして通す）
    console.warn(
      '[POST /api/chat] レートリミットのチェックに失敗したためバイパスしました。障害時フェイルオープン。',
      rateErr
    );
    limitPerMinResult = null;
    limitPerHourResult = null;
  }

  if (
    limitPerMinResult !== null &&
    limitPerHourResult !== null &&
    (limitPerMinResult.count > CHAT_RATE_LIMIT_PER_MINUTE ||
      limitPerHourResult.count > CHAT_RATE_LIMIT_PER_HOUR)
  ) {
    // レート超過時はロックを解放してから 429 を返す
    if (lockAcquired) {
      try {
        await chatGuardRepository.releaseLock(userId, ownerToken);
      } catch (releaseErr) {
        console.warn('[POST /api/chat] レート超過時のロック解放に失敗しました。', releaseErr);
      }
    }
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

  const encoder = new TextEncoder();

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
          topicRetriever: getTopicRetriever(),
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
          write(event);
        }
      } catch (err) {
        console.error('[POST /api/chat] ストリーミング中にエラーが発生しました', err);
        write({ type: 'error', message: CHAT_ERROR_MESSAGES.INTERNAL_ERROR });
      } finally {
        // lockAcquired が true のときだけ解放する（DB 障害でバイパスした場合は呼ばない）
        if (lockAcquired) {
          try {
            await chatGuardRepository.releaseLock(userId, ownerToken);
          } catch (releaseErr) {
            // ロック解放失敗は警告のみ（フェイルオープン方針に合わせて握りつぶす）
            console.warn('[POST /api/chat] ロック解放に失敗しました。', releaseErr);
          }
        }
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
