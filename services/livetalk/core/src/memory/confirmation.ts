/**
 * Tier C 記憶の昇格候補検出と「覚えとくね」プロンプト生成（Phase 3d / Issue #3282）。
 *
 * フロー:
 *   1. Tier C 記憶を全件取得
 *   2. ユーザー入力の embedding と cosine similarity を計算
 *   3. 閾値超えた候補を LLM で「本当に再言及か」判定
 *   4. cooldown 適用で「覚えとくね」を毎ターン言わないよう制御
 */

import { logger } from '@nagiyu/common';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import { cosineSimilarity } from './embedding.js';
import { CONFIRMATION_COOLDOWN_MS, PROMOTION_SIMILARITY_THRESHOLD } from '../constants.js';

interface PromotionJudgment {
  memoryId: string;
  promote: boolean;
}

async function judgePromotionsWithLLM(
  userInput: string,
  candidates: MemoryEntity[],
  llmClient: ILLMClient
): Promise<MemoryEntity[]> {
  const memoriesText = candidates
    .map((m) => `- ID: ${m.MemoryID}、内容: ${m.Content}`)
    .join('\n');

  const prompt = `以下はユーザーの発話と、過去に一度だけ観測された記憶（Tier C）の候補です。

【ユーザーの発話】
${userInput}

【昇格候補の記憶】
${memoriesText}

ユーザーの発話が上記の記憶について再確認・強調・肯定している場合のみ昇格（promote: true）としてください。
単に話題が関連しているだけでは昇格しません。ユーザーが同じ情報を再度明示している場合のみ昇格です。

以下の JSON 形式で返してください（JSON のみ）:
{"promotions": [{"memoryId": "...", "promote": true}, {"memoryId": "...", "promote": false}]}`;

  try {
    const raw = await llmClient.chatComplete(
      [{ role: 'user', content: prompt }],
      { purpose: 'classify' }
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as { promotions?: PromotionJudgment[] };
    if (!Array.isArray(parsed.promotions)) return [];

    const promoteIds = new Set(
      parsed.promotions.filter((p) => p.promote).map((p) => p.memoryId)
    );

    return candidates.filter((m) => promoteIds.has(m.MemoryID));
  } catch (err) {
    logger.warn('[confirmation] LLM 昇格判定に失敗しました', { err });
    return [];
  }
}

/**
 * 現在のユーザー入力に対して Tier C 記憶の中から「再言及」されたものを抽出し、
 * LLM で昇格すべきかを判定して返す。
 *
 * @param userId - ユーザー ID
 * @param characterId - キャラクター ID
 * @param userInput - 現在のユーザー発話
 * @param memoryRepository - Memory リポジトリ
 * @param embeddingClient - Embedding クライアント
 * @param llmClient - LLM クライアント（classify 用途）
 * @param nowMs - 現在時刻（ミリ秒、テスト差し替え用）
 */
export async function identifyPromotionCandidates(
  userId: string,
  characterId: string,
  userInput: string,
  memoryRepository: MemoryRepository,
  embeddingClient: IEmbeddingClient,
  llmClient: ILLMClient,
  nowMs: number = Date.now()
): Promise<MemoryEntity[]> {
  // Tier C 全件取得
  let tierCMemories: MemoryEntity[];
  try {
    tierCMemories = await memoryRepository.listByTier(userId, characterId, 'C');
  } catch (err) {
    logger.warn('[confirmation] Tier C 記憶の取得に失敗しました', { err });
    return [];
  }

  if (tierCMemories.length === 0) return [];

  // ユーザー入力の embedding 生成（失敗時はスキップ）
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddingClient.embed(userInput);
  } catch (err) {
    logger.warn('[confirmation] embedding 生成に失敗しました（昇格判定スキップ）', { err });
    return [];
  }

  // cosine similarity で再言及候補を抽出
  const candidates: MemoryEntity[] = [];
  for (const memory of tierCMemories) {
    if (!memory.Embedding || memory.Embedding.length === 0) continue;
    const similarity = cosineSimilarity(queryEmbedding, memory.Embedding);
    if (similarity >= PROMOTION_SIMILARITY_THRESHOLD) {
      candidates.push(memory);
    }
  }

  if (candidates.length === 0) return [];

  // LLM で昇格判定（fail-warn: エラー時は空配列で継続）
  return await judgePromotionsWithLLM(userInput, candidates, llmClient);
}

/**
 * 「新しく学んだこと」としてプロンプトに含める Memory を返す。
 *
 * 条件:
 * - 昇格候補（Tier C → B）であること
 * - cooldown 経過（直近 CONFIRMATION_COOLDOWN_MS 以内に参照済みは除外）
 *   → 同じ記憶について毎ターン「覚えとくね」と言わないよう制御する
 *
 * @param promotionCandidates - 昇格候補 Memory 一覧
 * @param nowMs - 現在時刻（ミリ秒、テスト差し替え用）
 */
export function identifyNewLearnings(
  promotionCandidates: MemoryEntity[],
  nowMs: number = Date.now()
): MemoryEntity[] {
  return promotionCandidates.filter((m) => {
    if (m.LastReferencedAt === undefined) return true;
    return nowMs - m.LastReferencedAt >= CONFIRMATION_COOLDOWN_MS;
  });
}
