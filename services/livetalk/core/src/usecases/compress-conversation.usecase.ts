import { performance } from 'perf_hooks';
import { logger } from '@nagiyu/common';
import { getDefaultTokenCounter } from '../lib/token-counter.js';
import { emitBatchMetricsLog, emitBatchMetricsEMF } from '../observability/metrics.js';
import { MEMORY_DEFAULT_CONFIDENCE } from '../constants.js';
import { calculateBidirectionalityDelta } from '../affection/calculator.js';
import { persistInterestCategories } from '../interest/category-extractor.js';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { CharacterStateRepository } from '../repositories/character-state.repository.interface.js';
import type { InterestRepository } from '../repositories/interest.repository.interface.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { MemorySummaryRepository } from '../repositories/memory-summary.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';

export interface CompressConversationParams {
  summaryRepo: MemorySummaryRepository;
  messageRepo: MessageRepository;
  memoryRepo: MemoryRepository;
  llmClient: ILLMClient;
  characterName: string;
  now?: () => number;
  /** 興味カテゴリ抽出・保存（Phase 3f）。未指定時はスキップ */
  interestRepo?: InterestRepository;
  /** bidirectionality を親密度に反映（Phase 3f）。未指定時はスキップ */
  characterStateRepo?: CharacterStateRepository;
  /**
   * 興味カテゴリの embedding ベース dedup（Issue #3325）。
   * 未指定時は文字列完全一致のみで dedup する。
   */
  embeddingClient?: IEmbeddingClient;
}

/**
 * 1 ユーザー × 1 キャラの会話を圧縮要約する。
 *
 * 処理フロー：
 * 1. MEMORY#SUMMARY の最終圧縮時刻を取得
 * 2. lastCompressedAt 以降のメッセージを listSince で取得
 * 3. メッセージが 0 件なら 'skipped' を返す
 * 4. LLM で要約 + 新規記憶候補抽出
 * 5. 新規記憶候補を Tier C として保存（embedding・TTL はリポジトリ任せ）
 * 6. MEMORY#SUMMARY を更新（既存 + 新規をマージした要約・LastCompressedAt を前進）
 *
 * 書き込み順序の意図（at-least-once 保証）：
 * memoryRepo.put を summaryRepo.put（LastCompressedAt の前進）より先に実行する。
 * もし memoryRepo.put が途中失敗しても LastCompressedAt は前進しないため、
 * 次回実行（DLQ/リトライ含む）で同じメッセージが再処理され、記憶の永久欠落を防ぐ。
 *
 * 注意：保証されるのは「欠落しない（at-least-once）」方向のみ。
 * summaryRepo.put 失敗後にリトライした場合、同一メッセージが再要約され、
 * Tier C 記憶が別 ID で重複保存され得る。不可逆な欠落を避けることを優先し、
 * （回復可能な）重複は許容する設計判断である。完全成功後の再実行は
 * LastCompressedAt 前進により no-op となり重複しない。
 *
 * @returns 'compressed' | 'skipped'
 */
export async function compressConversation(
  userId: string,
  characterId: string,
  params: CompressConversationParams
): Promise<'compressed' | 'skipped'> {
  const {
    summaryRepo,
    messageRepo,
    memoryRepo,
    llmClient,
    characterName,
    now = () => Date.now(),
    interestRepo,
    characterStateRepo,
    embeddingClient,
  } = params;

  const batchStart = performance.now();

  const summary = await summaryRepo.get(userId, characterId);
  const lastCompressedAt = summary?.LastCompressedAt ?? 0;

  const messages = await messageRepo.listSince(userId, characterId, lastCompressedAt);

  if (messages.length === 0) {
    logger.info('[compressConversation] スキップ（新着メッセージなし）', { userId, characterId });
    return 'skipped';
  }

  // listSince 直後にスナップショットを取ることで、summarize 実行中に届いたメッセージが
  // 次回 listSince(LastCompressedAt) で確実に拾われるようにする（off-by-one 防止）
  const compressedUpTo = now();

  logger.info('[compressConversation] 圧縮開始', {
    userId,
    characterId,
    messageCount: messages.length,
  });

  // 既存カテゴリ一覧をプロンプトに渡して粒度・dedup 判断を補助する（Issue #3325 / #3326）
  let existingInterestCategories: string[] | undefined;
  if (interestRepo) {
    try {
      const existing = await interestRepo.list(userId, characterId);
      if (existing.length > 0) {
        existingInterestCategories = existing.map((e) => e.Category);
      }
    } catch (err) {
      logger.warn('[compressConversation] 既存興味カテゴリの取得に失敗しました', {
        err,
        userId,
        characterId,
      });
    }
  }

  const result = await llmClient.summarize({
    existingSummary: summary?.SummaryText,
    newMessages: messages.map((m) => ({ role: m.Role, text: m.Text })),
    characterName,
    existingInterestCategories,
  });

  // 新規記憶候補を先に保存する（at-least-once 保証）
  // summaryRepo.put（LastCompressedAt の前進）より前に実行することで、
  // put が途中失敗しても LastCompressedAt が進まず、次回実行で再処理される（永久欠落防止）
  for (const candidate of result.newMemoryCandidates) {
    await memoryRepo.put({
      UserID: userId,
      CharacterID: characterId,
      Tier: 'C',
      Category: candidate.category,
      Content: candidate.content,
      Confidence: MEMORY_DEFAULT_CONFIDENCE.C,
      ReferencedCount: 0,
    });
  }

  await summaryRepo.put({
    UserID: userId,
    CharacterID: characterId,
    SummaryText: result.mergedSummary,
    LastCompressedAt: compressedUpTo,
  });

  // バッチ計測（best-effort）
  try {
    const counter = getDefaultTokenCounter();
    const summaryTokenCount = counter.countTokens(result.mergedSummary);
    const batchMetrics = {
      userId,
      characterId,
      timestamp: new Date().toISOString(),
      messageCount: messages.length,
      summaryTokenCount,
      summaryCharCount: result.mergedSummary.length,
      latencyMs: Math.round(performance.now() - batchStart),
    };
    emitBatchMetricsLog(batchMetrics);
    emitBatchMetricsEMF(batchMetrics);
  } catch (err) {
    logger.warn('[compressConversation] バッチ計測の emit に失敗しました', { err });
  }

  // 興味カテゴリ抽出・保存（fail-warn: エラー時はスキップして継続）
  // embeddingClient が指定されていれば同義カテゴリの dedup を実施（Issue #3325）
  if (interestRepo && result.interestCategories && result.interestCategories.length > 0) {
    try {
      await persistInterestCategories(
        userId,
        characterId,
        result.interestCategories,
        interestRepo,
        embeddingClient ? { embeddingClient } : undefined
      );
    } catch (err) {
      logger.warn('[compressConversation] 興味カテゴリの保存に失敗しました', {
        err,
        userId,
        characterId,
      });
    }
  }

  // 双方向性スコアを親密度に反映（fail-warn: エラー時はスキップして継続）
  if (characterStateRepo && result.bidirectionalityScore !== undefined) {
    try {
      const delta = calculateBidirectionalityDelta(result.bidirectionalityScore);
      if (delta > 0) {
        await characterStateRepo.updateAffection(userId, characterId, delta);
      }
    } catch (err) {
      logger.warn('[compressConversation] 親密度（双方向性）の更新に失敗しました', {
        err,
        userId,
        characterId,
      });
    }
  }

  logger.info('[compressConversation] 圧縮完了', {
    userId,
    characterId,
    candidateCount: result.newMemoryCandidates.length,
    interestCount: result.interestCategories?.length ?? 0,
    bidirectionalityScore: result.bidirectionalityScore,
  });

  return 'compressed';
}
