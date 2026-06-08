import type { CharacterDefinition } from '../characters/types.js';

export interface ResearchResult {
  topic: string;
  /** キャラ目線の要約 */
  summary: string;
  sourceUrls: string[];
  /** キャラのコメント（短い一言） */
  rawComment: string;
}

/**
 * Web リサーチクライアントの抽象インターフェース。
 *
 * 現在は OpenAI Web Search 実装のみ。将来 Brave Search 等に差し替え可能。
 */
export interface IResearchClient {
  research(query: string, character: CharacterDefinition): Promise<ResearchResult>;
}
