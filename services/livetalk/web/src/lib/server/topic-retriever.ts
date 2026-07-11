import { TopicRetriever } from '@nagiyu/livetalk-core';
import type { ITopicRetriever } from '@nagiyu/livetalk-core';
import { getEmbeddingClient } from './embedding';
import { getTopicRepository } from './repositories';

/**
 * Topic retriever（関連度 only の想起、リブトーク知識再設計 P2 / #3698）のシングルトン。
 * `getMemoryRetriever` と同じ流儀でキャッシュする。
 */
let cachedRetriever: ITopicRetriever | null = null;

export function getTopicRetriever(): ITopicRetriever {
  if (!cachedRetriever) {
    cachedRetriever = new TopicRetriever(getTopicRepository(), getEmbeddingClient());
  }
  return cachedRetriever;
}

export function setTopicRetrieverForTesting(retriever: ITopicRetriever | null): void {
  cachedRetriever = retriever;
}
