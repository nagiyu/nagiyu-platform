import { performance } from 'perf_hooks';
import { logger } from '@nagiyu/common';
import { calculateAffectionDelta, isNewActiveDay } from '../affection/calculator.js';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { IVoiceClient } from '../voicevox/types.js';
import type { CharacterStateRepository } from '../repositories/character-state.repository.interface.js';
import type { LifecycleRepository } from '../repositories/lifecycle.repository.interface.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { MemorySummaryRepository } from '../repositories/memory-summary.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../repositories/safety-event.repository.interface.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.interface.js';
import type { StudyTopicRepository } from '../repositories/study-topic.repository.interface.js';
import type { NoteRepository } from '../repositories/note.repository.interface.js';
import type { NoteEntity } from '../entities/note.entity.js';
import type { CharacterDefinition } from '../characters/types.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { MessageEntity } from '../entities/message.entity.js';
import type { LifecycleState } from '../entities/lifecycle.entity.js';
import { buildChatMessages, buildSystemPrompt } from '../characters/prompt-builder.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import { SentenceBuffer } from '../lib/sentence-splitter.js';
import { getDefaultTokenCounter } from '../lib/token-counter.js';
import {
  DEFAULT_CHARACTER_ID,
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  MEMORY_CATEGORY_CAP,
  MEMORY_COOLDOWN_MS,
  MEMORY_MAX_TIER_B,
  STUDY_TOPIC_TTL_SECONDS,
  STUDY_TOPIC_GATE_PRIORITY,
  NOTE_RECENT_DAYS,
  NOTE_RECENT_LIMIT,
} from '../constants.js';
import { detectSafetyRisk } from '../safety/detector.js';
import { buildModerationReplacementMessage, buildSafetyMessage } from '../safety/templates.js';
import { SAFETY_RESOURCES } from '../safety/resources.js';
import type { IModerationClient, SafetyResource } from '../safety/types.js';
import type { IMemoryRetriever, RetrievedMemory } from '../memory/types.js';
import { detectCorrection } from '../memory/correction-detector.js';
import { identifyNewLearnings, identifyPromotionCandidates } from '../memory/confirmation.js';
import { applyCorrection, executePromotion } from '../memory/promotion.js';
import { createPhaseTimer } from '../observability/timer.js';
import {
  createChatMetrics,
  emitChatMetricsLog,
  emitChatMetricsEMF,
} from '../observability/metrics.js';
import { evaluateKnowledgeGate } from '../study/knowledge-gate.js';
import type { KnowledgeMatcher } from '../study/knowledge-matcher.js';
import { buildStudyDeferralMessage } from '../study/templates.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';

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
  | { type: 'lifecycle'; state: LifecycleState }
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
  /** MemorySummary リポジトリ。prompt 注入 + 計測に使用。未指定時はスキップする */
  memorySummaryRepository?: MemorySummaryRepository;
  /** Lifecycle リポジトリ。未指定時はデフォルト就寝スケジュールで判定する */
  lifecycleRepository?: LifecycleRepository;
  /**
   * 知識ゲート（Phase 5b）。未指定時はゲートをスキップして従来フローで継続する。
   * 指定時は KNOWLEDGE を検索し、ヒット無し+要勉強なら LLM をバイパスして STUDY_TOPIC を登録する。
   */
  knowledgeRepository?: KnowledgeRepository;
  /** StudyTopic リポジトリ。knowledgeRepository 指定時に study 分岐で使用する */
  studyTopicRepository?: StudyTopicRepository;
  /**
   * Note リポジトリ（Phase 5c / #3345）。未指定時はノートの感想連携をスキップする。
   * 指定時は直近 NOTE_RECENT_DAYS 日に提示したノートを取得し、prompt context に注入する。
   */
  noteRepository?: NoteRepository;
  /**
   * 知識ベース照合のストラテジ。未指定時は文字 N-gram 照合（既定）。
   * 将来 embedding / LLM ベースの照合へ差し替えるための注入ポイント。
   */
  knowledgeMatcher?: KnowledgeMatcher;
  /** ULID ファクトリ。テスト時に差し替え可能。未指定時はデフォルト実装 */
  ulidFactory?: UlidFactory;
}

type SynthesisResult = { index: number; text: string; audio: string | null; elapsedMs: number };

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
  const start = performance.now();
  try {
    const wav = await voiceClient.synthesize(text, speakerId);
    const audio = arrayBufferToBase64(wav);
    return { index, text, audio, elapsedMs: Math.round(performance.now() - start) };
  } catch (err) {
    logger.error('[chat-usecase] VOICEVOX 合成に失敗しました', { err });
    return { index, text, audio: null, elapsedMs: Math.round(performance.now() - start) };
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
    memorySummaryRepository,
    lifecycleRepository,
    knowledgeRepository,
    studyTopicRepository,
    noteRepository,
    knowledgeMatcher,
    ulidFactory = defaultUlidFactory,
  } = params;

  const chatStart = performance.now();
  const metrics = createChatMetrics(userId, characterId);
  const timer = createPhaseTimer();

  // 1. CharacterState + MemorySummary + Lifecycle を並行取得
  //    MemorySummary の lastCompressedAt を境界として history を取得するため、先に解決する
  const [prevCharacterState, fetchedSummary, fetchedLifecycle] = await Promise.all([
    characterStateRepository
      ? characterStateRepository.getById({ userId, characterId }).catch((err) => {
          logger.warn('[chat-usecase] CharacterState の取得に失敗しました', { err });
          return null;
        })
      : Promise.resolve(null),
    memorySummaryRepository
      ? memorySummaryRepository.get(userId, characterId).catch((err) => {
          logger.warn('[chat-usecase] MemorySummary の取得に失敗しました（スキップ）', { err });
          return null;
        })
      : Promise.resolve(null),
    lifecycleRepository
      ? lifecycleRepository.get({ userId, characterId }).catch((err) => {
          logger.warn('[chat-usecase] Lifecycle の取得に失敗しました（デフォルト値で継続）', {
            err,
          });
          return null;
        })
      : Promise.resolve(null),
  ]);

  // 1b. 会話履歴取得：lastCompressedAt 以降のみ（要約済み分はプロンプトに含めない）
  //     MemorySummary 不在（初回・未圧縮）の場合は sinceMs=0 で全件取得（fallback）
  const sinceMs = fetchedSummary?.LastCompressedAt ?? 0;
  const history = await messageRepository.listSince(userId, characterId, sinceMs);

  // Lifecycle 状態を解決（fail-warn: 取得失敗時はデフォルト値）
  const lifecycleState = resolveLifecycleState(
    new Date(),
    fetchedLifecycle?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
    fetchedLifecycle?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME
  );

  // MemorySummary のサイズを計測（単調増加の検知）
  if (fetchedSummary) {
    metrics.summaryCharCount = fetchedSummary.SummaryText.length;
    metrics.summaryTokenCount = getDefaultTokenCounter().countTokens(fetchedSummary.SummaryText);
  }

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

  // 3.5. lifecycle event を emit（UI がモデル目パラメータを即座に反映できるよう通常フロー先頭で送出）
  yield { type: 'lifecycle', state: lifecycleState };

  // 3.6. 知識ゲート（Phase 5b / Issue #3344）
  // knowledgeRepository が指定されている場合のみ実行（未指定時は従来フローで継続）
  let knowledgeContextForPrompt:
    | import('../entities/knowledge.entity.js').KnowledgeEntity[]
    | undefined;
  if (knowledgeRepository) {
    try {
      const allKnowledge = await knowledgeRepository.list(userId, characterId);
      const gateResult = await evaluateKnowledgeGate(
        userText,
        character.displayName,
        allKnowledge,
        llmClient,
        knowledgeMatcher
      );

      if (gateResult.kind === 'study') {
        // STUDY_TOPIC 登録（fail-warn: 登録失敗でも応答は継続）
        if (studyTopicRepository) {
          try {
            const existingTopic = await studyTopicRepository.findPendingByTopic(
              userId,
              characterId,
              gateResult.normalizedTopic
            );
            if (!existingTopic) {
              const ttlUnixSec = Math.floor(Date.now() / 1000) + STUDY_TOPIC_TTL_SECONDS;
              await studyTopicRepository.put({
                UserID: userId,
                CharacterID: characterId,
                TopicID: ulidFactory(),
                Topic: gateResult.normalizedTopic,
                Priority: STUDY_TOPIC_GATE_PRIORITY,
                Status: 'pending',
                Ttl: ttlUnixSec,
              });
            }
          } catch (err) {
            logger.warn('[chat-usecase] StudyTopic の登録に失敗しました（スキップして継続）', {
              err,
            });
          }
        }

        // LLM をバイパスしてキャラ口調テンプレ応答を送出
        const studyMessage = buildStudyDeferralMessage(Date.now());
        yield* streamSafetyText(studyMessage, voiceClient, character.voiceConfig.speakerId);

        // アシスタントメッセージとして保存
        try {
          await messageRepository.create({
            UserID: userId,
            CharacterID: characterId,
            Role: 'assistant',
            Text: studyMessage,
          });
        } catch (err) {
          logger.error('[chat-usecase] 勉強応答メッセージの保存に失敗しました', { err });
        }

        yield { type: 'done' };
        return;
      }

      if (gateResult.kind === 'knowledge_hit') {
        // 知識を prompt context に注入して通常応答へ
        knowledgeContextForPrompt = gateResult.knowledge;
      }
      // kind === 'normal' は通常フローで継続（何もしない）
    } catch (err) {
      // fail-warn: ゲートエラーは通常フローで継続
      logger.warn('[chat-usecase] 知識ゲートの評価に失敗しました（通常フローで継続）', { err });
    }
  }

  // 4. Memory retrieve（fail-warn: エラー時は空配列で継続）
  let retrievedMemories: RetrievedMemory[] = [];
  if (memoryRetriever) {
    timer.start('retrieve');
    try {
      const retrieveResult = await memoryRetriever.retrieve(userId, characterId, {
        userInput: userText,
        maxTierB: MEMORY_MAX_TIER_B,
        cooldownMs: MEMORY_COOLDOWN_MS,
        categoryCapPerConversation: MEMORY_CATEGORY_CAP,
      });
      timer.end('retrieve');
      retrievedMemories = retrieveResult.memories;
      metrics.retrievedTierACount = retrievedMemories.filter((r) => r.memory.Tier === 'A').length;
      metrics.retrievedTierBCount = retrievedMemories.filter((r) => r.memory.Tier === 'B').length;
      // Tier A はリトリーバルで全件取得されるため、注入数 = 総件数
      metrics.tierATotalCount = metrics.retrievedTierACount;
      if (retrieveResult.consumedCapacity !== undefined) {
        metrics.dynamodb.memoryConsumedRcu = retrieveResult.consumedCapacity;
      }
    } catch (err) {
      timer.end('retrieve');
      logger.warn('[chat-usecase] Memory retrieve に失敗しました（メモリなしで継続）', { err });
    }
    metrics.latency.retrieve = timer.elapsedMs('retrieve');
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
    timer.start('promotionCheck');
    try {
      promotionCandidates = await identifyPromotionCandidates(
        userId,
        characterId,
        userText,
        memoryRepository,
        embeddingClient,
        llmClient
      );
      timer.end('promotionCheck');
    } catch (err) {
      timer.end('promotionCheck');
      logger.warn('[chat-usecase] 昇格候補検出に失敗しました（スキップして継続）', { err });
    }
    metrics.latency.promotionCheck = timer.elapsedMs('promotionCheck');
  }
  const newLearnings = identifyNewLearnings(promotionCandidates);

  // 4c. 直近に提示したノートを取得（感想連携、Phase 5c / fail-warn: エラー時は空配列で継続）
  let recentNotes: NoteEntity[] = [];
  if (noteRepository) {
    try {
      recentNotes = await noteRepository.listRecent(userId, characterId, {
        days: NOTE_RECENT_DAYS,
        limit: NOTE_RECENT_LIMIT,
      });
    } catch (err) {
      logger.warn('[chat-usecase] 直近ノートの取得に失敗しました（ノートなしで継続）', { err });
    }
  }

  // 5. LLM ストリーミング（通常フロー）
  const chatMessages = buildChatMessages(
    character,
    new Date(),
    history,
    userText,
    retrievedMemories,
    fetchedSummary?.SummaryText,
    newLearnings.length > 0 ? newLearnings : undefined,
    lifecycleState,
    knowledgeContextForPrompt,
    recentNotes.length > 0 ? recentNotes : undefined
  );

  // プロンプトトークン内訳を計算（best-effort）
  try {
    const counter = getDefaultTokenCounter();
    const baseSystem = buildSystemPrompt(character, new Date());
    const systemTokens = counter.countTokens(baseSystem);
    const summaryTokens = metrics.summaryTokenCount;
    const memoryTokens =
      retrievedMemories.reduce((sum, r) => sum + counter.countTokens(r.memory.Content), 0) +
      newLearnings.reduce((sum, m) => sum + counter.countTokens(m.Content), 0);
    const messageTokens =
      history.reduce((sum, m) => sum + counter.countTokensForMessage(m.Text), 0) +
      counter.countTokensForMessage(userText);
    metrics.promptTokens = {
      system: systemTokens,
      summary: summaryTokens,
      memory: memoryTokens,
      messages: messageTokens,
      total: systemTokens + summaryTokens + memoryTokens + messageTokens,
    };
  } catch (err) {
    logger.warn('[chat-usecase] プロンプトトークン計算に失敗しました（スキップ）', { err });
  }

  const sentenceBuffer = new SentenceBuffer();
  let fullResponseText = '';
  const pendingSynthesis: Array<Promise<SynthesisResult>> = [];
  let sentenceIndex = 0;

  const llmStart = performance.now();
  let llmTtfbCaptured = false;

  for await (const delta of llmClient.chatStream(chatMessages)) {
    if (!llmTtfbCaptured) {
      metrics.latency.llmTtfb = Math.round(performance.now() - llmStart);
      llmTtfbCaptured = true;
    }
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

  metrics.latency.llmTotal = Math.round(performance.now() - llmStart);

  const remaining = sentenceBuffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(
      synthesizeSentence(voiceClient, remaining, character.voiceConfig.speakerId, idx)
    );
  }

  // 7. sentence events を順番通りに yield（VOICEVOX 合計レイテンシを集計）
  let voicevoxTotalMs = 0;
  for (const promise of pendingSynthesis) {
    const result = await promise;
    voicevoxTotalMs += result.elapsedMs;
    if (result.audio !== null) {
      yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
    }
  }
  metrics.latency.voicevoxTotal = voicevoxTotalMs > 0 ? voicevoxTotalMs : undefined;

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
  metrics.latency.chatTotal = Math.round(performance.now() - chatStart);
  yield { type: 'done' };

  // 計測結果を emit（best-effort: 例外が本処理を止めない）
  try {
    emitChatMetricsLog(metrics);
    emitChatMetricsEMF(metrics);
  } catch (err) {
    logger.warn('[chat-usecase] 計測の emit に失敗しました', { err });
  }

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
