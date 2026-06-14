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
 * keyphrase recall の計算対象とする最小 2-gram 数。
 * 2-gram が 2 個以下（正規化後 3 文字以下）のキーフレーズは「飲み物」「ゲーム」等の
 * 短い一般カテゴリ名が該当し、偶然の 1 gram 一致で閾値に達して暴発しやすいため除外する。
 */
const KEYPHRASE_MIN_BIGRAM_COUNT = 3;

/**
 * keyphrase recall を有効とみなす最小の絶対一致 gram 数。
 * 割合（recall）が閾値を満たしても、共有 gram が 1 個だけの近接語（例「編み物」×「飲み物」）は
 * 誤ヒットとみなして弾く。割合ガードと併用して適合率を確保する。
 */
const KEYPHRASE_MIN_OVERLAP = 2;

/**
 * 文字 2-gram の重なり率でキーワード照合する既定マッチャ（外部依存なし）。
 *
 * 日本語はスペースで分かち書きされないため substring 照合だと自然文
 * （例「最近の飲み物のトレンド知ってる？」）を取りこぼす。2 つの指標の最大値で
 * ヒット判定することで、フィラー付き自然文での再現率を確保しつつ後方互換を維持する。
 *
 * ## 指標 1: keyphrase recall（フィラー対策の本命）
 * 知識の Topic / RelatedCategory（キーフレーズ）ごとに
 * `overlap(grams(keyphrase) ∩ grams(user)) / grams(keyphrase).size` を計算し最大を取る。
 * 分母がキーフレーズ側なので、ユーザー発話にフィラーが多くても薄まらない。
 * 暴発抑制として 2-gram が {@link KEYPHRASE_MIN_BIGRAM_COUNT} 個未満の短い
 * キーフレーズは対象外とし、さらに共有 gram が {@link KEYPHRASE_MIN_OVERLAP} 個未満の
 * 弱い部分一致も弾く。
 *
 * ## 指標 2: user recall（後方互換）
 * `overlap(grams(user) ∩ grams(target)) / grams(user).size`。
 * target は `${Topic} ${RelatedCategory} ${Summary}`（RelatedCategory を含む）。
 * 分母はユーザー発話側。
 *
 * 最終スコア = `max(keyphraseRecall, userRecall)` が `minRatio` 以上なら一致。
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

    return knowledge.filter((k) => this.matchScore(userGrams, k) >= this.minRatio);
  }

  /**
   * ユーザー発話と知識エンティティの一致スコア（0〜1）を返す。
   * keyphrase recall と user recall の最大値。
   */
  private matchScore(userGrams: Set<string>, knowledge: KnowledgeEntity): number {
    const keyphraseRecall = this.calcKeyphraseRecall(userGrams, knowledge);
    const userRecall = this.calcUserRecall(
      userGrams,
      `${knowledge.Topic} ${knowledge.RelatedCategory} ${knowledge.Summary}`
    );
    return Math.max(keyphraseRecall, userRecall);
  }

  /**
   * keyphrase recall: Topic / RelatedCategory ごとに
   * `overlap(grams(field) ∩ grams(user)) / grams(field).size` を計算し最大を返す。
   *
   * 2-gram 数が {@link KEYPHRASE_MIN_BIGRAM_COUNT} 未満のフィールド、および共有 gram が
   * {@link KEYPHRASE_MIN_OVERLAP} 未満の弱い部分一致は除外（暴発抑制）。
   * RelatedCategory が空文字の場合も除外。
   */
  private calcKeyphraseRecall(userGrams: Set<string>, knowledge: KnowledgeEntity): number {
    const candidates: string[] = [knowledge.Topic];
    if (knowledge.RelatedCategory.length > 0) {
      candidates.push(knowledge.RelatedCategory);
    }

    let maxRecall = 0;
    for (const field of candidates) {
      const fieldGrams = toBigrams(field);
      // 2-gram 数が最小数未満のキーフレーズは除外（暴発抑制）
      if (fieldGrams.size < KEYPHRASE_MIN_BIGRAM_COUNT) continue;

      let overlap = 0;
      for (const gram of fieldGrams) {
        if (userGrams.has(gram)) overlap++;
      }
      // 共有 gram が少なすぎる弱い部分一致は誤ヒットとして弾く
      if (overlap < KEYPHRASE_MIN_OVERLAP) continue;

      const recall = overlap / fieldGrams.size;
      if (recall > maxRecall) maxRecall = recall;
    }
    return maxRecall;
  }

  /**
   * user recall: `overlap(grams(user) ∩ grams(target)) / grams(user).size`。
   * target は `${Topic} ${RelatedCategory} ${Summary}` を結合した文字列。
   */
  private calcUserRecall(userGrams: Set<string>, target: string): number {
    const targetGrams = toBigrams(target);
    let overlap = 0;
    for (const gram of userGrams) {
      if (targetGrams.has(gram)) overlap++;
    }
    return overlap / userGrams.size;
  }
}
