import type { IEmbeddingClient } from '../llm-client/types.js';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import { cosineSimilarity } from './embedding.js';
import type {
  IMemoryRetriever,
  RetrieveOptions,
  RetrievedMemory,
  RetrieveResult,
} from './types.js';

/**
 * embedding ベースの Memory retriever。
 *
 * フロー:
 *   1. ユーザー入力の embedding を生成（失敗時は Tier A のみ返す）
 *   2. Tier A 全件取得（無条件で注入）
 *   3. Tier B 全件取得 → cosine similarity 計算
 *   4. cooldown 適用（直近 cooldownMs 以内に参照済みを除外）
 *   5. カテゴリキャップ適用（同カテゴリは categoryCapPerConversation 件まで）
 *   6. 降順ソート → 上位 maxTierB 件を返す
 */
export class MemoryRetriever implements IMemoryRetriever {
  private readonly memoryRepository: MemoryRepository;
  private readonly embeddingClient: IEmbeddingClient;
  private readonly nowMs: () => number;

  constructor(
    memoryRepository: MemoryRepository,
    embeddingClient: IEmbeddingClient,
    nowMs: () => number = () => Date.now()
  ) {
    this.memoryRepository = memoryRepository;
    this.embeddingClient = embeddingClient;
    this.nowMs = nowMs;
  }

  public async retrieve(
    userId: string,
    characterId: string,
    options: RetrieveOptions
  ): Promise<RetrieveResult> {
    const { userInput, maxTierB, cooldownMs, categoryCapPerConversation } = options;

    // 1. Tier A 全件（無条件）
    const { items: tierAMemories, consumedCapacity: tierARcu } =
      await this.memoryRepository.listByTier(userId, characterId, 'A');
    const tierAResults: RetrievedMemory[] = tierAMemories.map((memory) => ({
      memory,
      similarity: 1.0,
    }));

    // 2. ユーザー入力の embedding 生成（失敗時は Tier A のみ）
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingClient.embed(userInput);
    } catch {
      return {
        memories: tierAResults,
        consumedCapacity: tierARcu,
      };
    }

    // 3. Tier B 全件取得 + cosine similarity 計算
    const { items: tierBMemories, consumedCapacity: tierBRcu } =
      await this.memoryRepository.listByTier(userId, characterId, 'B');
    const now = this.nowMs();

    const tierBCandidates: RetrievedMemory[] = [];
    for (const memory of tierBMemories) {
      // embedding が未生成の Memory はスキップ
      if (!memory.Embedding || memory.Embedding.length === 0) continue;

      // 4. cooldown 適用
      if (memory.LastReferencedAt !== undefined && now - memory.LastReferencedAt < cooldownMs) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, memory.Embedding);
      tierBCandidates.push({ memory, similarity });
    }

    // 5. カテゴリキャップ適用（降順ソート後に先着順で制限）
    tierBCandidates.sort((a, b) => b.similarity - a.similarity);

    const categoryCount = new Map<string, number>();
    const tierBResults: RetrievedMemory[] = [];

    for (const candidate of tierBCandidates) {
      if (tierBResults.length >= maxTierB) break;

      const cat = candidate.memory.Category;
      const count = categoryCount.get(cat) ?? 0;
      if (count >= categoryCapPerConversation) continue;

      categoryCount.set(cat, count + 1);
      tierBResults.push(candidate);
    }

    const totalRcu = (tierARcu ?? 0) + (tierBRcu ?? 0);
    return {
      memories: [...tierAResults, ...tierBResults],
      consumedCapacity: totalRcu > 0 ? totalRcu : undefined,
    };
  }
}
