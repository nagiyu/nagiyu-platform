import type { KnowledgeEntity } from '../entities/knowledge.entity.js';
import { KNOWLEDGE_MATCH_MIN_RATIO } from '../constants.js';

/**
 * 知識ベース照合のストラテジ。
 *
 * 既定はコスト 0 の文字 N-gram 照合（{@link NgramKnowledgeMatcher}）だが、
 * 将来 embedding（Phase 3b 流用）や LLM ベースの照合へ差し替えられるよう
 * インターフェースを分離している。非同期シグネチャは embedding/LLM 実装を見据えたもの。
 */
export interface KnowledgeMatcher {
  /** userText に関連する Knowledge を返す（0 件なら未ヒット）。 */
  findMatches(userText: string, knowledge: KnowledgeEntity[]): Promise<KnowledgeEntity[]>;
}

/**
 * 照合用の区切り文字（空白・記号）。`\s` は U+3000（全角スペース）も含むため
 * 全角スペースを別途列挙する必要はない。
 */
const DELIMITER_PATTERN = /[\s、。，．！？!?「」『』【】・\-_,./（）()：:〜~"”'’]/g;

/** 照合用にテキストを正規化する（小文字化 + 空白・記号除去）。 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(DELIMITER_PATTERN, '');
}

/** 正規化テキストの文字 2-gram 集合を返す。 */
export function toBigrams(text: string): Set<string> {
  const normalized = normalizeForMatch(text);
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

/**
 * 文字 2-gram の重なり率でキーワード照合する既定マッチャ（外部依存なし）。
 *
 * 日本語はスペースで分かち書きされないため substring 照合だと自然文
 * （例「最近の飲み物のトレンド知ってる？」）を取りこぼす。ユーザー発話を
 * 文字 2-gram に分解し、知識テキスト（Topic + Summary）の 2-gram に
 * 含まれる割合が閾値以上なら一致とみなすことで再現率を確保する。
 */
export class NgramKnowledgeMatcher implements KnowledgeMatcher {
  private readonly minRatio: number;

  constructor(minRatio: number = KNOWLEDGE_MATCH_MIN_RATIO) {
    this.minRatio = minRatio;
  }

  public async findMatches(
    userText: string,
    knowledge: KnowledgeEntity[]
  ): Promise<KnowledgeEntity[]> {
    if (knowledge.length === 0) return [];
    const userGrams = toBigrams(userText);
    if (userGrams.size === 0) return [];

    return knowledge.filter(
      (k) => this.matchRatio(userGrams, `${k.Topic} ${k.Summary}`) >= this.minRatio
    );
  }

  /** userGrams のうち target に含まれる割合（0〜1）。 */
  private matchRatio(userGrams: Set<string>, target: string): number {
    const targetGrams = toBigrams(target);
    let overlap = 0;
    for (const gram of userGrams) {
      if (targetGrams.has(gram)) overlap++;
    }
    return overlap / userGrams.size;
  }
}
