import { performance } from 'perf_hooks';
import { logger } from '@nagiyu/common';
import {
  TOPIC_ROUTING_SIMILARITY_THRESHOLD,
  TOPIC_ROUTING_MAX_CANDIDATES,
  CONSOLIDATION_ROUTING_TEXT_MAX_CHARS,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../constants.js';
import { cosineSimilarity } from '../memory/embedding.js';
import { emitBatchMetricsLog, emitBatchMetricsEMF } from '../observability/metrics.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { ConsolidationSchema } from '../llm-client/schemas/consolidation.schema.js';
import { buildConsolidatePrompt } from './consolidate.prompt.js';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { WebFactVolatility } from '../entities/web-fact.entity.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { WebRawRepository } from '../repositories/webraw.repository.interface.js';
import type { ConsolidationCursorRepository } from '../repositories/consolidation-cursor.repository.interface.js';

export interface ConsolidateParams {
  topicRepo: TopicRepository;
  messageRepo: MessageRepository;
  webRawRepo: WebRawRepository;
  cursorRepo: ConsolidationCursorRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  characterName: string;
  now?: () => number;
  /** 新規 Topic の ID 採番に使う（テスト差し替え用）。既定は {@link defaultUlidFactory} */
  ulidFactory?: UlidFactory;
}

/**
 * 揮発性区分から次回再検証予定時刻（NextReview）を計算する。
 * `stable` は再検証不要のため undefined を返す。
 */
function computeNextReview(volatility: WebFactVolatility, readAt: number): number | undefined {
  if (volatility === 'stable') return undefined;
  return readAt + WEBFACT_REVIEW_INTERVAL_MS[volatility];
}

/**
 * ルーティング用テキストを末尾側から `CONSOLIDATION_ROUTING_TEXT_MAX_CHARS` 文字に切り詰める。
 * 直近の話題ほど関連性が高いため、先頭（古い部分）を切り捨てる。
 */
function truncateRoutingText(text: string): string {
  if (text.length <= CONSOLIDATION_ROUTING_TEXT_MAX_CHARS) return text;
  return text.slice(text.length - CONSOLIDATION_ROUTING_TEXT_MAX_CHARS);
}

/**
 * 1 ユーザー × 1 キャラの未集約データ（Message / WebRaw）を Topic 中心モデルへ集約する
 * （リブトーク知識再設計 P1 / #3697）。
 *
 * 処理フロー：
 * 1. CURSOR から前回集約済み位置（MsgCursor / WebrawCursor）を取得
 * 2. カーソル以降の Message / WebRaw を listSince で取得。両方 0 件なら 'skipped'
 * 3. 新規データ（会話 + Web 生データ）から「ルーティング用テキスト」を作り、埋め込みで
 *    既存 Topic ヘッダ（GSI3 経由で全件列挙）との cosine similarity を計算し、閾値以上・
 *    上位 N 件を候補 Topic として LLM プロンプトに渡す
 * 4. LLM が話題ごとに「既存 Topic への merge」または「新規作成」を判断し、
 *    canonicalSummary・selfFacts・webFacts を返す
 * 5. 各 Topic について META（put）→ SELF/WEB fact（append）の順で書き込む
 * 6. 全 Topic の適用が成功したら、カーソルをストリーム別・条件付きで前進させる
 *
 * 書き込み順序の意図（at-least-once 保証、`compressConversation` と同じ設計）：
 * META・fact の書き込みをカーソル前進（cursorRepo.put）より先に行う。
 * 途中で例外が発生した場合はそのまま伝播させ、カーソルは前進しない。
 * 次回実行（DLQ/リトライ含む）で同じ Message/WebRaw が再処理され、集約の永久欠落を防ぐ。
 *
 * カーソルは Message / WebRaw で独立して管理し、消費した範囲の最大 CreatedAt までにしか
 * 前進させない（空ストリームは据え置き）。これにより `listSince` の strict `>` と
 * 条件付き put（楽観ロック）で二重処理を防ぎつつ、backdated なデータの欠落を最小化する。
 *
 * `OptimisticLockError`（putTopic / cursorRepo.put の条件不一致）はここでは捕捉せず、
 * そのまま呼び出し元に伝播させる（カーソル未前進のまま次回再処理される）。
 *
 * @returns 'consolidated' | 'skipped'
 */
export async function consolidate(
  userId: string,
  characterId: string,
  params: ConsolidateParams
): Promise<'consolidated' | 'skipped'> {
  const {
    topicRepo,
    messageRepo,
    webRawRepo,
    cursorRepo,
    llmClient,
    embeddingClient,
    characterName,
    now = () => Date.now(),
    ulidFactory = defaultUlidFactory,
  } = params;

  const batchStart = performance.now();

  const cursor = await cursorRepo.get(userId, characterId);
  const msgCursor = cursor?.MsgCursor ?? 0;
  const webrawCursor = cursor?.WebrawCursor ?? 0;
  const cursorUpdatedAt = cursor?.UpdatedAt;

  const messages = await messageRepo.listSince(userId, characterId, msgCursor);
  const webraws = await webRawRepo.listSince(userId, characterId, webrawCursor);

  if (messages.length === 0 && webraws.length === 0) {
    logger.info('[consolidate] スキップ（未集約データなし）', { userId, characterId });
    return 'skipped';
  }

  // listSince 直後にスナップショットを取ることで、WEB fact の観測時刻・再検証起点を
  // 集約処理中の時間経過に依存させない（compressConversation の compressedUpTo と同じ意図）
  const readAt = now();

  logger.info('[consolidate] 集約開始', {
    userId,
    characterId,
    messageCount: messages.length,
    webRawCount: webraws.length,
  });

  // ---- ルーティング候補の算出 ----
  const routingTextRaw = [
    ...messages.map((m) => `${m.Role}: ${m.Text}`),
    ...webraws.map((w) => w.RawText),
  ].join('\n');
  const routingText = truncateRoutingText(routingTextRaw);

  const queryEmbedding = await embeddingClient.embed(routingText);
  const headers = await topicRepo.listTopicHeaders(userId, characterId);

  const scored = headers
    .map((header) => ({ header, similarity: cosineSimilarity(queryEmbedding, header.Embedding) }))
    .filter((s) => s.similarity >= TOPIC_ROUTING_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOPIC_ROUTING_MAX_CANDIDATES);

  const candidateMap = new Map<string, TopicEntity>(
    scored.map((s) => [s.header.TopicID, s.header])
  );

  // ---- LLM 呼び出し ----
  const promptMessages = buildConsolidatePrompt({
    characterName,
    candidateTopics: scored.map((s) => ({
      topicId: s.header.TopicID,
      subject: s.header.Subject,
      category: s.header.Category,
      canonicalSummary: s.header.CanonicalSummary,
    })),
    newMessages: messages.map((m) => ({ role: m.Role, text: m.Text })),
    webRaws: webraws.map((w) => ({
      query: w.Query,
      rawText: w.RawText,
      sourceUrls: w.SourceUrls,
    })),
  });

  const result = await llmClient.chatStructured(promptMessages, ConsolidationSchema, {
    purpose: 'summarize',
  });

  // ---- 適用（at-least-once: 例外はそのまま伝播させ、カーソルを前進させない）----
  let newTopicCount = 0;
  let updatedTopicCount = 0;
  let selfFactCount = 0;
  let webFactCount = 0;

  for (const topicResult of result.topics) {
    const topicEmbedding = await embeddingClient.embed(
      `${topicResult.subject}\n${topicResult.canonicalSummary}`
    );

    const existing =
      topicResult.targetTopicId !== '' ? candidateMap.get(topicResult.targetTopicId) : undefined;

    let topicId: string;
    if (existing) {
      // 既存 Topic への merge（名寄せ）
      topicId = existing.TopicID;
      const care = existing.Care + 1;
      await topicRepo.putTopic(
        {
          UserID: userId,
          CharacterID: characterId,
          TopicID: topicId,
          Subject: topicResult.subject,
          CanonicalSummary: topicResult.canonicalSummary,
          Category: topicResult.category,
          Care: care,
          Embedding: topicEmbedding,
        },
        { expectedUpdatedAt: existing.UpdatedAt }
      );
      updatedTopicCount++;
    } else {
      // 新規 Topic（targetTopicId が空文字、または候補に無い id ＝ hallucination 保険）
      topicId = ulidFactory();
      await topicRepo.putTopic({
        UserID: userId,
        CharacterID: characterId,
        TopicID: topicId,
        Subject: topicResult.subject,
        CanonicalSummary: topicResult.canonicalSummary,
        Category: topicResult.category,
        Care: 1,
        Embedding: topicEmbedding,
      });
      newTopicCount++;
    }

    for (const sf of topicResult.selfFacts) {
      await topicRepo.putSelfFact({
        UserID: userId,
        CharacterID: characterId,
        TopicID: topicId,
        Text: sf.text,
        Provenance: sf.provenance,
      });
      selfFactCount++;
    }

    for (const wf of topicResult.webFacts) {
      await topicRepo.putWebFact({
        UserID: userId,
        CharacterID: characterId,
        TopicID: topicId,
        Text: wf.text,
        SourceUrls: wf.sourceUrls,
        Volatility: wf.volatility,
        ObservedAt: readAt,
        NextReview: computeNextReview(wf.volatility, readAt),
      });
      webFactCount++;
    }
  }

  // ---- カーソル前進（ストリーム別・条件付き。空ストリームは据え置き）----
  const newMsgCursor = messages.length
    ? Math.max(...messages.map((m) => m.CreatedAt))
    : msgCursor;
  const newWebrawCursor = webraws.length
    ? Math.max(...webraws.map((w) => w.CreatedAt))
    : webrawCursor;

  await cursorRepo.put(
    {
      UserID: userId,
      CharacterID: characterId,
      MsgCursor: newMsgCursor,
      WebrawCursor: newWebrawCursor,
    },
    { expectedUpdatedAt: cursorUpdatedAt }
  );

  // バッチ計測（best-effort）
  try {
    const batchMetrics = {
      userId,
      characterId,
      timestamp: new Date().toISOString(),
      messageCount: messages.length,
      summaryTokenCount: 0,
      summaryCharCount: 0,
      latencyMs: Math.round(performance.now() - batchStart),
    };
    emitBatchMetricsLog(batchMetrics);
    emitBatchMetricsEMF(batchMetrics);
  } catch (err) {
    logger.warn('[consolidate] バッチ計測の emit に失敗しました', { err });
  }

  logger.info('[consolidate] 集約完了', {
    userId,
    characterId,
    topicCount: result.topics.length,
    newTopicCount,
    updatedTopicCount,
    selfFactCount,
    webFactCount,
  });

  return 'consolidated';
}
