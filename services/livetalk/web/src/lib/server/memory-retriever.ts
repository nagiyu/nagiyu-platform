import { MemoryRetriever } from '@nagiyu/livetalk-core';
import type { IMemoryRetriever } from '@nagiyu/livetalk-core';
import { getEmbeddingClient } from './embedding';
import { getMemoryRepository } from './repositories';

let cachedRetriever: IMemoryRetriever | null = null;

export function getMemoryRetriever(): IMemoryRetriever {
  if (!cachedRetriever) {
    cachedRetriever = new MemoryRetriever(getMemoryRepository(), getEmbeddingClient());
  }
  return cachedRetriever;
}

export function setMemoryRetrieverForTesting(retriever: IMemoryRetriever | null): void {
  cachedRetriever = retriever;
}
