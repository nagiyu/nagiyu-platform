import type { WebFactEntity } from '../entities/web-fact.entity.js';

/**
 * WEB fact を観測日時の新しい順に並べ、先頭 `limit` 件を返す。
 *
 * 古い事実と新しい事実が混ざって LLM に伝わるのと、プロンプトの肥大による原価増を避けるため、
 * 読む側は全件ではなく新しい側だけを使う。観測日時が同じ場合は ULID の factId が大きい方
 * （新しい方）を先にして、並びを決定的にする。入力配列は変更しない。
 */
export function selectRecentWebFacts<T extends Pick<WebFactEntity, 'observedAt' | 'factId'>>(
  facts: readonly T[],
  limit: number
): T[] {
  return [...facts]
    .sort((a, b) => {
      if (a.observedAt !== b.observedAt) return b.observedAt - a.observedAt;
      if (a.factId === b.factId) return 0;
      return a.factId < b.factId ? 1 : -1;
    })
    .slice(0, Math.max(0, limit));
}
