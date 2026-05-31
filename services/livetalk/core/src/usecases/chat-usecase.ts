import { logger } from '@nagiyu/common';
import { calculateAffectionDelta, isNewActiveDay } from '../affection/calculator.js';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { IVoiceClient } from '../voicevox/types.js';
import type { CharacterStateRepository } from '../repositories/character-state.repository.interface.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../repositories/safety-event.repository.interface.js';
import type { CharacterDefinition } from '../characters/types.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { MessageEntity } from '../entities/message.entity.js';
import { buildChatMessages } from '../characters/prompt-builder.js';
import { SentenceBuffer } from '../lib/sentence-splitter.js';
import {
  DEFAULT_CHARACTER_ID,
  MEMORY_CATEGORY_CAP,
  MEMORY_COOLDOWN_MS,
  MEMORY_MAX_TIER_B,
} from '../constants.js';
import { detectSafetyRisk } from '../safety/detector.js';
import { buildModerationReplacementMessage, buildSafetyMessage } from '../safety/templates.js';
import { SAFETY_RESOURCES } from '../safety/resources.js';
import type { IModerationClient, SafetyResource } from '../safety/types.js';
import type { IMemoryRetriever, RetrievedMemory } from '../memory/types.js';
import { detectCorrection } from '../memory/correction-detector.js';
import { identifyNewLearnings, identifyPromotionCandidates } from '../memory/confirmation.js';
import { applyCorrection, executePromotion } from '../memory/promotion.js';

/**
 * /api/chat ストリーミングレスポンスの各イベント型。
 *
 * - text: LLM からの逐次テキスト delta
 * - sentence: 文単位の音声（base64 WAV）。LLM ストリーム完了後に順番通り emit される
 * - safety: セーフティ介入（キーワード検出 or Moderation フラグ）
 *   - input_keyword: ユーザー入力にリスクワードを検出 → LLM をバイパスして介入
 *   - output_moderation: AI 応答が Moderation API にフラグされた → UI で置換を促す
 * - done: ストリーム終了
 */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | {
      type: 'safety';
      trigger: 'input_keyword' | 'output_moderation';
      resources: SafetyResource[];
      replacementText?: string;
    }
  | { type: 'done' };

export interface ChatUseCaseParams {
  userId: string;
  characterId?: string;
  userText: string;
  character: CharacterDefinition;
  llmClient: ILLMClient;
  voiceClient: IVoiceClient;
  messageRepository: MessageRepository;
  /** セーフティイベントリポジトリ。未指定時はセーフティログをスキップする */
  safetyEventRepository?: SafetyEventRepository;
  /** Moderation クライアント。未指定時は応答後チェックをスキップする */
  moderationClient?: IModerationClient;
  /** Memory retriever。未指定時はメモリ注入をスキップする */
  memoryRetriever?: IMemoryRetriever;
  /** memoryRetriever が指定された場合に使う Memory リポジトリ */
  memoryRepository?: MemoryRepository;
  /** Tier C 昇格候補検出に使う Embedding クライアント。未指定時は昇格処理をスキップする */
  embeddingClient?: IEmbeddingClient;
  /** CharacterState リポジトリ。未指定時は親密度更新をスキップする */
  characterStateRepository?: CharacterStateRepository;
}

type SynthesisResult = { index: number; text: string; audio: string | null };

function getLastAssistantMessage(history: MessageEntity[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].Role === 'assistant') return history[i].Text;
  }
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function synthesizeSentence(
  voiceClient: IVoiceClient,
  text: string,
  speakerId: number,
  index: number
): Promise<SynthesisResult> {
  try {
    const wav = await voiceClient.synthesize(text, speakerId);
    const audio = arrayBufferToBase64(wav);
    return { index, text, audio };
  } catch (err) {
    logger.error('[chat-usecase] VOICEVOX 合成に失敗しました', { err });
    return { index, text, audio: null };
  }
}

/**
 * 文字列を文単位でストリーム風に yield しながら同時に VOICEVOX 合成を行う。
 * セーフティ介入テキストを音声付きで送出するために使う。
 */
async function* streamSafetyText(
  text: string,
  voiceClient: IVoiceClient,
  speakerId: number
): AsyncGenerator<ChatEvent> {
  const buffer = new SentenceBuffer();
  const pendingSynthesis: Array<Promise<SynthesisResult>> = [];
  let sentenceIndex = 0;

  // 1 文字ずつ yield してテキストストリーム風に見せる（セーフティ応答は固定文なので全体を送る）
  for (const char of text) {
    yield { type: 'text', delta: char };
    for (const sentence of buffer.push(char)) {
      const idx = sentenceIndex++;
      pendingSynthesis.push(synthesizeSentence(voiceClient, sentence, speakerId, idx));
    }
  }

  const remaining = buffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(synthesizeSentence(voiceClient, remaining, speakerId, idx));
  }

  for (const promise of pendingSynthesis) {
    const result = await promise;
    if (result.audio !== null) {
      yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
    }
  }
}

/**
 * チャット応答の orchestration（Phase 2d / Issue #3250 でセーフティフロー追加）。
 *
 * フロー:
 *   1. 直近会話履歴を取得
 *   2. ユーザーメッセージを保存
 *   3. キーワード検出 → リスクあり → セーフティフロー（LLM をバイパス）
 *   4. 通常フロー: LLM ストリーミング → text delta を逐次 yield
 *   5. 通常フロー: 文区切りごとに VOICEVOX を非同期起動
 *   6. 通常フロー: LLM 完了後、Moderation API で応答チェック
 *   7. sentence events を順番通りに yield
 *   8. done を yield
 *   9. アシスタントメッセージを保存
 *
 * セーフティフロー（キーワード検出時）:
 *   - SafetyEvent をログに保存
 *   - 桃瀬ひより口調の介入メッセージを text/sentence events として送出
 *   - safety event（リソース一覧）を emit → UI でモーダル表示
 *   - アシスタントメッセージとして介入テキストを保存
 *   - done を emit して終了
 *
 * Moderation フラグ時（応答後チェック）:
 *   - SafetyEvent をログに保存
 *   - safety event（trigger=output_moderation, replacementText あり）を emit
 *   - UI 側でテキストを置換してモーダル表示
 */
export async function* runChatUseCase(params: ChatUseCaseParams): AsyncGenerator<ChatEvent> {
  const {
    userId,
    characterId = DEFAULT_CHARACTER_ID,
    userText,
    character,
    llmClient,
    voiceClient,
    messageRepository,
    safetyEventRepository,
    moderationClient,
    memoryRetriever,
    memoryRepository,
    embeddingClient,
    characterStateRepository,
  } = params;

  // 1. 直近会話履歴取得（+ CharacterState を先取りして prevLastInteractionAt を確保）
  const [{ messages: history }, prevCharacterState] = await Promise.all([
    messageRepository.getRecentByTokenBudget({ userId, characterId }),
    characterStateRepository
      ? characterStateRepository.getById({ userId, characterId }).catch((err) => {
          logger.warn('[chat-usecase] CharacterState の取得に失敗しました', { err });
          return null;
        })
      : Promise.resolve(null),
  ]);

  // 2. ユーザーメッセージを保存
  await messageRepository.create({
    UserID: userId,
    CharacterID: characterId,
    Role: 'user',
    Text: userText,
  });

  // 3. キーワード検出
  const detection = detectSafetyRisk(userText);
  if (detection) {
    const safetyMessage = buildSafetyMessage(detection.category, character, Date.now());
    const detectedPattern = `[${detection.patternDescription}] ${detection.matchedText}`;

    // SafetyEvent ログ
    if (safetyEventRepository) {
      try {
        await safetyEventRepository.create({
          UserID: userId,
          Trigger: 'input_keyword',
          DetectedPattern: detectedPattern,
          InputText: userText,
          ResponseText: safetyMessage,
        });
      } catch (err) {
        logger.error('[chat-usecase] SafetyEvent の保存に失敗しました', { err });
      }
    }

    // 介入テキストを text/sentence events として送出
    yield* streamSafetyText(safetyMessage, voiceClient, character.voiceConfig.speakerId);

    // safety event（UI でモーダル表示）
    yield { type: 'safety', trigger: 'input_keyword', resources: SAFETY_RESOURCES };

    // アシスタントメッセージとして保存
    try {
      await messageRepository.create({
        UserID: userId,
        CharacterID: characterId,
        Role: 'assistant',
        Text: safetyMessage,
      });
    } catch (err) {
      logger.error('[chat-usecase] セーフティ応答メッセージの保存に失敗しました', { err });
    }

    yield { type: 'done' };
    return;
  }

  // 4. Memory retrieve（fail-warn: エラー時は空配列で継続）
  let retrievedMemories: RetrievedMemory[] = [];
  if (memoryRetriever) {
    try {
      retrievedMemories = await memoryRetriever.retrieve(userId, characterId, {
        userInput: userText,
        maxTierB: MEMORY_MAX_TIER_B,
        cooldownMs: MEMORY_COOLDOWN_MS,
        categoryCapPerConversation: MEMORY_CATEGORY_CAP,
      });
    } catch (err) {
      logger.warn('[chat-usecase] Memory retrieve に失敗しました（メモリなしで継続）', { err });
    }
  }

  // 4a. 暗黙訂正検出（fail-warn: エラー時はスキップして継続）
  if (memoryRepository && retrievedMemories.length > 0) {
    const lastAssistantMessage = getLastAssistantMessage(history);
    if (lastAssistantMessage) {
      try {
        const correction = await detectCorrection(
          userText,
          lastAssistantMessage,
          retrievedMemories,
          llmClient
        );
        if (correction.detected) {
          await applyCorrection(correction, memoryRepository);
        }
      } catch (err) {
        logger.warn('[chat-usecase] 暗黙訂正検出に失敗しました（スキップして継続）', { err });
      }
    }
  }

  // 4b. Tier C 昇格候補検出（fail-warn: エラー時は空配列で継続）
  let promotionCandidates: MemoryEntity[] = [];
  if (memoryRepository && embeddingClient) {
    try {
      promotionCandidates = await identifyPromotionCandidates(
        userId,
        characterId,
        userText,
        memoryRepository,
        embeddingClient,
        llmClient
      );
    } catch (err) {
      logger.warn('[chat-usecase] 昇格候補検出に失敗しました（スキップして継続）', { err });
    }
  }
  const newLearnings = identifyNewLearnings(promotionCandidates);

  // 5. LLM ストリーミング（通常フロー）
  const chatMessages = buildChatMessages(
    character,
    new Date(),
    history,
    userText,
    retrievedMemories,
    undefined,
    newLearnings.length > 0 ? newLearnings : undefined
  );
  const sentenceBuffer = new SentenceBuffer();
  let fullResponseText = '';
  const pendingSynthesis: Array<Promise<SynthesisResult>> = [];
  let sentenceIndex = 0;

  for await (const delta of llmClient.chatStream(chatMessages)) {
    yield { type: 'text', delta };
    fullResponseText += delta;

    // 6. 文区切りで VOICEVOX を非同期起動
    for (const sentence of sentenceBuffer.push(delta)) {
      const idx = sentenceIndex++;
      pendingSynthesis.push(
        synthesizeSentence(voiceClient, sentence, character.voiceConfig.speakerId, idx)
      );
    }
  }

  const remaining = sentenceBuffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(
      synthesizeSentence(voiceClient, remaining, character.voiceConfig.speakerId, idx)
    );
  }

  // 7. sentence events を順番通りに yield
  for (const promise of pendingSynthesis) {
    const result = await promise;
    if (result.audio !== null) {
      yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
    }
  }

  // 8. Moderation API チェック（fail-warn: エラー時は通常応答を通す）
  if (moderationClient && fullResponseText.trim()) {
    try {
      const modResult = await moderationClient.check(fullResponseText);
      if (modResult.flagged) {
        const flaggedCategories = Object.entries(modResult.categories)
          .filter(([, v]) => v)
          .map(([k]) => k);

        if (safetyEventRepository) {
          try {
            await safetyEventRepository.create({
              UserID: userId,
              Trigger: 'output_moderation',
              DetectedPattern: `Moderation flagged: ${flaggedCategories.join(', ')}`,
              InputText: userText,
              ResponseText: fullResponseText,
              ModerationCategories: JSON.stringify(modResult.categories),
            });
          } catch (err) {
            logger.error('[chat-usecase] Moderation SafetyEvent の保存に失敗しました', { err });
          }
        }

        const replacementText = buildModerationReplacementMessage(Date.now());
        yield {
          type: 'safety',
          trigger: 'output_moderation',
          resources: SAFETY_RESOURCES,
          replacementText,
        };
      }
    } catch (err) {
      // fail-warn: Moderation API エラーはログに残して通常応答を継続
      logger.warn('[chat-usecase] Moderation API チェックに失敗しました（通常応答を継続）', {
        err,
      });
    }
  }

  // 9. done
  yield { type: 'done' };

  // 10. アシスタントメッセージを保存
  const assistantText = fullResponseText.trim();
  if (assistantText) {
    try {
      await messageRepository.create({
        UserID: userId,
        CharacterID: characterId,
        Role: 'assistant',
        Text: assistantText,
      });
    } catch (err) {
      logger.error('[chat-usecase] アシスタントメッセージの保存に失敗しました', { err });
    }
  }

  // 11. Tier C → B 昇格を実行（fire-and-forget）
  if (memoryRepository && promotionCandidates.length > 0) {
    void executePromotion(promotionCandidates, memoryRepository).catch((err) => {
      logger.warn('[chat-usecase] Tier C → B 昇格に失敗しました', { err });
    });
  }

  // 12. 親密度を更新（fire-and-forget、infoDisclosure + timeContinuity の 2 軸）
  // bidirectionality は日次圧縮バッチで別途反映する
  if (characterStateRepository) {
    const now = Date.now();
    const newActiveDay = isNewActiveDay(prevCharacterState?.LastInteractionAt, now);
    const delta = calculateAffectionDelta({
      infoDisclosure: promotionCandidates.length,
      isNewActiveDay: newActiveDay,
    });
    if (delta > 0) {
      void characterStateRepository.updateAffection(userId, characterId, delta).catch((err) => {
        logger.warn('[chat-usecase] 親密度の更新に失敗しました', { err });
      });
    }
  }

  // 13. 参照済み Memory の referencedCount / lastReferencedAt を更新（fire-and-forget）
  if (memoryRepository && retrievedMemories.length > 0) {
    const now = Date.now();
    void Promise.all(
      retrievedMemories.map((r) =>
        memoryRepository
          .update({
            UserID: r.memory.UserID,
            CharacterID: r.memory.CharacterID,
            Tier: r.memory.Tier,
            Category: r.memory.Category,
            MemoryID: r.memory.MemoryID,
            ReferencedCount: r.memory.ReferencedCount + 1,
            LastReferencedAt: now,
          })
          .catch((err) => {
            logger.warn('[chat-usecase] Memory 参照情報の更新に失敗しました', { err });
          })
      )
    );
  }
}
