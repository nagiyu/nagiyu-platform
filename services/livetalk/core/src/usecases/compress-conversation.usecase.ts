import { logger } from '@nagiyu/common';
import { MEMORY_DEFAULT_CONFIDENCE } from '../constants.js';
import type { MemorySummaryRepository } from '../repositories/memory-summary.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { ILLMClient } from '../llm-client/types.js';

export interface CompressConversationParams {
  summaryRepo: MemorySummaryRepository;
  messageRepo: MessageRepository;
  memoryRepo: MemoryRepository;
  llmClient: ILLMClient;
  characterName: string;
  now?: () => number;
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
  } = params;

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

  const result = await llmClient.summarize({
    existingSummary: summary?.SummaryText,
    newMessages: messages.map((m) => ({ role: m.Role, text: m.Text })),
    characterName,
  });

  await summaryRepo.put({
    UserID: userId,
    CharacterID: characterId,
    SummaryText: result.mergedSummary,
    LastCompressedAt: now(),
  });

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

  logger.info('[compressConversation] 圧縮完了', {
    userId,
    characterId,
    candidateCount: result.newMemoryCandidates.length,
  });
}
