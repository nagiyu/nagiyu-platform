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
 * 3. メッセージが 0 件なら何もしない（return）
 * 4. LLM で要約 + 新規記憶候補抽出
 * 5. MEMORY#SUMMARY を更新（既存 + 新規をマージした要約）
 * 6. 新規記憶候補を Tier C として保存（embedding・TTL はリポジトリ任せ）
 */
export async function compressConversation(
  userId: string,
  characterId: string,
  params: CompressConversationParams
): Promise<void> {
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
    return;
  }

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

  await summaryRepo.put({
    UserID: userId,
    CharacterID: characterId,
    SummaryText: result.mergedSummary,
    LastCompressedAt: now(),
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
}
