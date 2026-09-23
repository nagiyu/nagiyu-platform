import { performance } from 'perf_hooks';
import { logger } from '@nagiyu/common';
import { calculateAffectionDelta, isNewActiveDay } from '../affection/calculator.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { IVoiceClient, VoiceConfig } from '../voice/types.js';
import type { CharacterStateRepository } from '../repositories/character-state.repository.interface.js';
import type { LifecycleRepository } from '../repositories/lifecycle.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../repositories/safety-event.repository.interface.js';
import type { StudyTopicRepository } from '../repositories/study-topic.repository.interface.js';
import type { NoteRepository } from '../repositories/note.repository.interface.js';
import type { ConsolidationCursorRepository } from '../repositories/consolidation-cursor.repository.interface.js';
import type { NoteEntity } from '../entities/note.entity.js';
import type { CharacterDefinition } from '../characters/types.js';
import type { LifecycleState } from '../entities/lifecycle.entity.js';
import { buildChatMessages, buildSystemPrompt } from '../characters/prompt-builder.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import { SentenceBuffer } from '../lib/sentence-splitter.js';
import { getDefaultTokenCounter } from '../lib/token-counter.js';
import {
  DEFAULT_CHARACTER_ID,
  LIFECYCLE_DEFAULT_BEDTIME,
  LIFECYCLE_DEFAULT_WAKE_UP_TIME,
  STUDY_TOPIC_TTL_SECONDS,
  STUDY_TOPIC_GATE_PRIORITY,
  NOTE_RECENT_DAYS,
  NOTE_RECENT_LIMIT,
  TOPIC_RECALL_SIMILARITY_THRESHOLD,
  TOPIC_RECALL_TOP_K,
  TOPIC_RECALL_RELATED_THRESHOLD,
  TOPIC_RECALL_RELATED_MAX,
} from '../constants.js';
import { detectSafetyRisk } from '../safety/detector.js';
import { buildModerationReplacementMessage, buildSafetyMessage } from '../safety/templates.js';
import { SAFETY_RESOURCES } from '../safety/resources.js';
import type { IModerationClient, SafetyResource } from '../safety/types.js';
import { createPhaseTimer } from '../observability/timer.js';
import {
  createChatMetrics,
  emitChatMetricsLog,
  emitChatMetricsEMF,
} from '../observability/metrics.js';
import { classifyTopic } from '../study/knowledge-gate.js';
import { buildStudyDeferralMessage } from '../study/templates.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import type { ITopicRetriever, RetrievedTopic } from '../knowledge/retrieval.js';

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
  /** CharacterState リポジトリ。未指定時は親密度更新をスキップする */
  characterStateRepository?: CharacterStateRepository;
  /** Lifecycle リポジトリ。未指定時はデフォルト就寝スケジュールで判定する */
  lifecycleRepository?: LifecycleRepository;
  /** StudyTopic リポジトリ。未指定時は知識ゲートの study 分岐で登録をスキップする */
  studyTopicRepository?: StudyTopicRepository;
  /**
   * Note リポジトリ（Phase 5c / #3345）。未指定時はノートの感想連携をスキップする。
   * 指定時は直近 NOTE_RECENT_DAYS 日に提示したノートを取得し、prompt context に注入する。
   */
  noteRepository?: NoteRepository;
  /** ULID ファクトリ。テスト時に差し替え可能。未指定時はデフォルト実装 */
  ulidFactory?: UlidFactory;
  /**
   * Topic retriever（リブトーク知識再設計 P2 / #3698）。関連度 only の Topic 想起を行う。
   * P5 で旧 Tier memory / MemorySummary 経路を撤去したため必須パラメータになった。
   */
  topicRetriever: ITopicRetriever;
  /**
   * 集約カーソルリポジトリ（リブトーク知識・記憶再設計 P5 / #3697）。
   * 会話履歴の取得境界（未集約＝ライブ文脈）を MsgCursor で決める。
   * 未指定・取得失敗時は sinceMs=0（全件取得）へフォールバックする。
   */
  consolidationCursorRepository?: ConsolidationCursorRepository;
}

type SynthesisResult = { index: number; text: string; audio: string | null; elapsedMs: number };

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
  voice: VoiceConfig,
  index: number
): Promise<SynthesisResult> {
  const start = performance.now();
  try {
    const wav = await voiceClient.synthesize(text, voice);
    const audio = arrayBufferToBase64(wav);
    return { index, text, audio, elapsedMs: Math.round(performance.now() - start) };
  } catch (err) {
    logger.error('[chat-usecase] 音声合成に失敗しました', { err });
    return { index, text, audio: null, elapsedMs: Math.round(performance.now() - start) };
  }
}

/**
 * 文字列を文単位でストリーム風に yield しながら同時に TTS 合成を行う。
 * セーフティ介入テキストを音声付きで送出するために使う。
 *
 * @param options.emitText - true（デフォルト）のとき text イベントを yield する。
 *   output_moderation フラグ時は false を指定して text イベントを抑制する（表示は safety
 *   イベントの replacementText に任せ、ストリーム済みの元テキストへの追記を防ぐ）。
 */
async function* streamSafetyText(
  text: string,
  voiceClient: IVoiceClient,
  voice: VoiceConfig,
  options?: { emitText?: boolean }
): AsyncGenerator<ChatEvent> {
  const emitText = options?.emitText ?? true;
  const buffer = new SentenceBuffer();
  const pendingSynthesis: Array<Promise<SynthesisResult>> = [];
  let sentenceIndex = 0;

  // 1 文字ずつ yield してテキストストリーム風に見せる（セーフティ応答は固定文なので全体を送る）
  for (const char of text) {
    if (emitText) {
      yield { type: 'text', delta: char };
    }
    for (const sentence of buffer.push(char)) {
      const idx = sentenceIndex++;
      pendingSynthesis.push(synthesizeSentence(voiceClient, sentence, voice, idx));
    }
  }

  const remaining = buffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(synthesizeSentence(voiceClient, remaining, voice, idx));
  }

  for (const promise of pendingSynthesis) {
    const result = await promise;
    if (result.audio !== null) {
      yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
    }
  }
}

/**
 * チャット応答の orchestration（リブトーク知識・記憶再設計 P5 / #3697 で Topic 中心モデルへ簡素化）。
 *
 * フロー:
 *   1. CharacterState + 集約カーソル + Lifecycle を並行取得
 *   1b. 会話履歴を集約カーソル境界（MsgCursor 以降 = 未集約分）で取得
 *   2. ユーザーメッセージを保存
 *   3. キーワード検出 → リスクあり → セーフティフロー（LLM をバイパス）
 *   3.6. Topic retrieve（関連度 only）。知識ゲートより先に想起し、既知 WEB Topic の
 *        有無を判定材料にする（回帰修正 / knowledge_hit 経路の Topic モデルでの復活）
 *   3.7. 知識ゲート（classifyTopic による study 判定。既に WEB fact を持つ関連 Topic が
 *        想起できているときはスキップし、通常フロー（想起注入）へ進む）
 *   4c. 直近ノート取得（感想連携）
 *   5. 通常フロー: LLM ストリーミング → text delta を逐次 yield
 *   6. 通常フロー: 文区切りごとに VOICEVOX を非同期起動
 *   7. 通常フロー: LLM 完了後、Moderation API で応答チェック
 *   8. sentence events を順番通りに yield
 *   9. done を yield
 *   10. アシスタントメッセージを保存
 *   11. 親密度を更新（infoDisclosure は Tier 昇格撤去に伴い常に 0。isNewActiveDay のみ反映）
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
    characterStateRepository,
    lifecycleRepository,
    studyTopicRepository,
    noteRepository,
    ulidFactory = defaultUlidFactory,
    topicRetriever,
    consolidationCursorRepository,
  } = params;

  const chatStart = performance.now();
  const metrics = createChatMetrics(userId, characterId);
  const timer = createPhaseTimer();

  // 1. CharacterState + 集約カーソル + Lifecycle を並行取得
  //    集約カーソル（MsgCursor）を history の取得境界として使うため、先に解決する
  const [prevCharacterState, cursor, fetchedLifecycle] = await Promise.all([
    characterStateRepository
      ? characterStateRepository.getById({ userId, characterId }).catch((err) => {
          logger.warn('[chat-usecase] CharacterState の取得に失敗しました', { err });
          return null;
        })
      : Promise.resolve(null),
    consolidationCursorRepository
      ? consolidationCursorRepository.get(userId, characterId).catch((err) => {
          logger.warn(
            '[chat-usecase] ConsolidationCursor の取得に失敗しました（sinceMs=0 で全件取得）',
            { err }
          );
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

  // 1b. 会話履歴取得：集約カーソル（MsgCursor）以降のみ（未集約分＝ライブ文脈）
  //     カーソル不在（未指定・初回未集約・取得失敗）の場合は sinceMs=0 で全件取得（fallback）
  const sinceMs = cursor?.MsgCursor ?? 0;
  const history = await messageRepository.listSince(userId, characterId, sinceMs);

  // Lifecycle 状態を解決（fail-warn: 取得失敗時はデフォルト値）
  const lifecycleState = resolveLifecycleState(
    new Date(),
    fetchedLifecycle?.Bedtime ?? LIFECYCLE_DEFAULT_BEDTIME,
    fetchedLifecycle?.WakeUpTime ?? LIFECYCLE_DEFAULT_WAKE_UP_TIME
  );

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
          CharacterID: characterId,
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
    yield* streamSafetyText(safetyMessage, voiceClient, character.voiceConfig);

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

  // 3.6. Topic retrieve（関連度 only、リブトーク知識再設計 P2 / #3698、fail-warn: エラー時は空配列で継続）
  // 知識ゲートより先に実行する（回帰修正）: 既に WEB fact を持つ関連 Topic の有無を
  // 知識ゲートの判定材料にするため、想起結果が先に必要になる。
  let retrievedTopics: RetrievedTopic[] = [];
  timer.start('retrieve');
  try {
    retrievedTopics = await topicRetriever.retrieve(userId, characterId, {
      userInput: userText,
      threshold: TOPIC_RECALL_SIMILARITY_THRESHOLD,
      topK: TOPIC_RECALL_TOP_K,
      relatedThreshold: TOPIC_RECALL_RELATED_THRESHOLD,
      relatedMax: TOPIC_RECALL_RELATED_MAX,
    });
    timer.end('retrieve');
  } catch (err) {
    timer.end('retrieve');
    logger.warn('[chat-usecase] Topic retrieve に失敗しました（想起なしで継続）', { err });
  }
  metrics.latency.retrieve = timer.elapsedMs('retrieve');
  logger.info('[chat-usecase] topic recall counts', {
    userId,
    characterId,
    retrievedTopicCount: retrievedTopics.length,
  });

  // 3.7. 知識ゲート（リブトーク知識・記憶再設計 P5 / #3697、回帰修正で Topic 想起の後段に移動）
  // classifyTopic による study 判定（旧 Knowledge ベースの knowledge_hit 経路は撤去済み）。
  //
  // 【回帰修正】既に関連 Topic に WEB fact（調べ済みの知識）があるなら、その話題は
  // 「既知」とみなして study に倒さず、通常フロー（想起注入で回答）へ進める。
  // 旧 P5 実装は Topic 想起（旧 step 4）より前に知識ゲートを置いていたため、WEB fact が
  // 既にあっても needsStudy=true と判定されると study 定型文で return してしまい、
  // 通知タップ等で「調べ済みの話題」を聞いても一切活用されない回帰があった。
  // ここで hasKnownWebTopic を判定材料に加え、旧「knowledge_hit」経路を Topic モデルで復活させる。
  // SELF fact のみの Topic は「既知」に含めない（贈る/答える中身の知識が無いため）。
  const hasKnownWebTopic = retrievedTopics.some((rt) => rt.webFacts.length > 0);

  if (!hasKnownWebTopic) {
    try {
      const classification = await classifyTopic(userText, character.displayName, llmClient);

      if (classification.needsStudy) {
        // STUDY_TOPIC 登録（fail-warn: 登録失敗でも応答は継続）
        if (studyTopicRepository) {
          try {
            const existingTopic = await studyTopicRepository.findPendingByTopic(
              userId,
              characterId,
              classification.normalizedTopic
            );
            if (!existingTopic) {
              const ttlUnixSec = Math.floor(Date.now() / 1000) + STUDY_TOPIC_TTL_SECONDS;
              await studyTopicRepository.put({
                UserID: userId,
                CharacterID: characterId,
                TopicID: ulidFactory(),
                Topic: classification.normalizedTopic,
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
        yield* streamSafetyText(studyMessage, voiceClient, character.voiceConfig);

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
      // needsStudy === false は通常フローで継続（何もしない）
    } catch (err) {
      // fail-warn: ゲートエラーは通常フローで継続
      logger.warn('[chat-usecase] 知識ゲートの評価に失敗しました（通常フローで継続）', { err });
    }
  }
  // hasKnownWebTopic === true の場合は知識ゲート（classifyTopic 呼び出しを含む）を丸ごと
  // スキップして通常フローへ進む（既知話題ではホットパスの classify LLM 呼び出しも省ける）。

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
    lifecycleState,
    recentNotes.length > 0 ? recentNotes : undefined,
    retrievedTopics
  );

  // プロンプトトークン内訳を計算（best-effort）
  try {
    const counter = getDefaultTokenCounter();
    const baseSystem = buildSystemPrompt(character, new Date());
    const systemTokens = counter.countTokens(baseSystem);
    const retrievalTokens = retrievedTopics.reduce(
      (sum, rt) =>
        sum +
        rt.selfFacts.reduce((s, f) => s + counter.countTokens(f.Text), 0) +
        rt.webFacts.reduce((s, f) => s + counter.countTokens(f.Text), 0),
      0
    );
    const messageTokens =
      history.reduce((sum, m) => sum + counter.countTokensForMessage(m.Text), 0) +
      counter.countTokensForMessage(userText);
    metrics.promptTokens = {
      system: systemTokens,
      summary: 0,
      memory: retrievalTokens,
      messages: messageTokens,
      total: systemTokens + retrievalTokens + messageTokens,
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

    // 6. 文区切りで TTS を非同期起動
    for (const sentence of sentenceBuffer.push(delta)) {
      const idx = sentenceIndex++;
      pendingSynthesis.push(synthesizeSentence(voiceClient, sentence, character.voiceConfig, idx));
    }
  }

  metrics.latency.llmTotal = Math.round(performance.now() - llmStart);

  const remaining = sentenceBuffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(synthesizeSentence(voiceClient, remaining, character.voiceConfig, idx));
  }

  // 7. Moderation API チェック（fail-warn: エラー時は通常応答を通す）
  //
  // 【修正: 音声 emit より前に判定する】
  // 旧実装では sentence(音声) emit 後に Moderation 判定していたため、フラグ時も
  // 元返答の音声がすでに送出済みになるすり抜けバグがあった。
  // 修正後: LLM 完了・sentenceBuffer flush の直後、かつ pendingSynthesis を await する前に
  // Moderation を判定し、フラグ有無で sentence 送出経路を切り替える。
  let moderationFlagged = false;
  let moderationReplacement: string | undefined;

  if (moderationClient && fullResponseText.trim()) {
    try {
      const modResult = await moderationClient.check(fullResponseText);
      if (modResult.flagged) {
        moderationFlagged = true;

        const flaggedCategories = Object.entries(modResult.categories)
          .filter(([, v]) => v)
          .map(([k]) => k);

        if (safetyEventRepository) {
          try {
            await safetyEventRepository.create({
              UserID: userId,
              CharacterID: characterId,
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

        moderationReplacement = buildModerationReplacementMessage(Date.now());
        // safety イベント（表示の差し替え + モーダル）を先に送出
        yield {
          type: 'safety',
          trigger: 'output_moderation',
          resources: SAFETY_RESOURCES,
          replacementText: moderationReplacement,
        };
      }
    } catch (err) {
      // fail-warn: Moderation API エラーはログに残して通常応答を継続
      logger.warn('[chat-usecase] Moderation API チェックに失敗しました（通常応答を継続）', {
        err,
      });
    }
  }

  // 8. sentence events を順番通りに yield（TTS 合計レイテンシを集計）
  //
  // フラグなし: pendingSynthesis（元返答）をそのまま emit。
  // フラグあり: 元返答の pendingSynthesis は emit せず（合成はすでに非同期起動済みだが
  //   unhandled rejection は synthesizeSentence 内部で catch 済みのため安全）、
  //   置換文を streamSafetyText で TTS 化して sentence events として送出する。
  //   text イベントは出さない（表示は safety イベントの replacementText 置換に任せる）。
  let ttsTotalMs = 0;
  if (!moderationFlagged) {
    for (const promise of pendingSynthesis) {
      const result = await promise;
      ttsTotalMs += result.elapsedMs;
      if (result.audio !== null) {
        yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
      }
    }
  } else {
    // 置換文を音声化して sentence として送出（text イベントは抑制）
    yield* streamSafetyText(moderationReplacement!, voiceClient, character.voiceConfig, {
      emitText: false,
    });
  }
  metrics.latency.ttsTotal = ttsTotalMs > 0 ? ttsTotalMs : undefined;

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
  // フラグ時は置換文を保存（元の有害テキストを会話履歴に残さない）
  const assistantText = (moderationFlagged ? moderationReplacement : fullResponseText)?.trim();
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

  // 11. 親密度を更新（fire-and-forget）。
  // Tier 昇格機構の撤去に伴い infoDisclosure は常に 0 となり、親密度は isNewActiveDay
  // （日次の再訪ボーナス）のみで上昇する。体験活用は別ロードマップ（R1）のスコープ。
  if (characterStateRepository) {
    const now = Date.now();
    const newActiveDay = isNewActiveDay(prevCharacterState?.LastInteractionAt, now);
    const delta = calculateAffectionDelta({
      infoDisclosure: 0,
      isNewActiveDay: newActiveDay,
    });
    if (delta > 0) {
      void characterStateRepository.updateAffection(userId, characterId, delta).catch((err) => {
        logger.warn('[chat-usecase] 親密度の更新に失敗しました', { err });
      });
    }
  }
}
