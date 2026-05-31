import type { MemoryEntity } from '../entities/memory.entity.js';

export interface RetrieveOptions {
  userInput: string;
  maxTierB: number;
  cooldownMs: number;
  categoryCapPerConversation: number;
}

export interface RetrievedMemory {
  memory: MemoryEntity;
  /** Tier A は 1.0 固定、Tier B は cosine similarity */
  similarity: number;
}

/** retrieve の戻り値。消費 RCU を best-effort で含む。 */
export interface RetrieveResult {
  memories: RetrievedMemory[];
  /** DynamoDB 消費 RCU の合計（Tier A + Tier B クエリ分）。best-effort で undefined の場合がある。 */
  consumedCapacity?: number;
}

export interface IMemoryRetriever {
  retrieve(
    userId: string,
    characterId: string,
    options: RetrieveOptions
  ): Promise<RetrieveResult>;
}
