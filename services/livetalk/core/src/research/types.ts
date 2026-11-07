import type { CharacterDefinition } from '../characters/types.js';

/**
 * リサーチ 1 回分の Web 検索 tool call 回数。
 * 課金は tool call 単位のため、合計と action 別の内訳を持つ。
 */
export interface WebSearchCallCounts {
  /** `web_search_call` の総数 */
  total: number;
  /** action が search のもの */
  search: number;
  /** action が open_page のもの */
  openPage: number;
  /** action が find_in_page のもの */
  findInPage: number;
  /** 上記以外（SDK に未定義の action 等） */
  other: number;
}

export interface ResearchResult {
  topic: string;
  /** キャラ目線の要約 */
  summary: string;
  sourceUrls: string[];
  /** キャラのコメント（短い一言） */
  rawComment: string;
  /** Web 検索の回数。回数を取れない実装（テスト用の差し替え等）では省略する */
  webSearchCalls?: WebSearchCallCounts;
}

/**
 * Web リサーチクライアントの抽象インターフェース。
 *
 * 現在は OpenAI Web Search 実装のみ。将来 Brave Search 等に差し替え可能。
 */
export interface IResearchClient {
  research(query: string, character: CharacterDefinition): Promise<ResearchResult>;
}
