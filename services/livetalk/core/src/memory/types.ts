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

export interface IMemoryRetriever {
  retrieve(userId: string, characterId: string, options: RetrieveOptions): Promise<RetrievedMemory[]>;
}
