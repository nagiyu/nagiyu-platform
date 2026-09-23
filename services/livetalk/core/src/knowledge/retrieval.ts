import { logger } from '@nagiyu/common';
import type { IEmbeddingClient } from '../llm-client/types.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { SelfFactEntity } from '../entities/self-fact.entity.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
import { cosineSimilarity } from '../memory/embedding.js';

/**
 * 想起（関連度 only）で選抜された Topic 1 件分（リブトーク知識再設計 P2 / #3698）。
 *
 * `via` は選抜経路。`direct` は発話 embedding との cosine が閾値を超えたもの、
 * `related` は direct 集合の座標近傍（1 ホップ関連展開）で追加されたもの。
 */
export interface RetrievedTopic {
  topic: TopicEntity;
  selfFacts: SelfFactEntity[];
  webFacts: WebFactEntity[];
  /** direct は発話との cosine、related は選抜集合との最大 cosine */
  similarity: number;
  via: 'direct' | 'related';
}

/**
 * `TopicRetriever.retrieve` のオプション。
 *
 * すべて呼び出し側（chat-usecase）が定数（`constants.ts`）から渡す想定。
 */
export interface TopicRetrieveOptions {
  userInput: string;
  threshold: number;
  topK: number;
  relatedThreshold: number;
  relatedMax: number;
}

/**
 * Topic 想起（関連度 only）の抽象インターフェース。
 */
export interface ITopicRetriever {
  retrieve(
    userId: string,
    characterId: string,
    options: TopicRetrieveOptions
  ): Promise<RetrievedTopic[]>;
}

interface ScoredHeader {
  header: TopicEntity;
  similarity: number;
}

/**
 * embedding ベースの Topic retriever（関連度 only）（リブトーク知識再設計 P2 / #3698）。
 *
 * フロー:
 *   1. ユーザー入力の embedding を生成（失敗時は fail-warn で空配列を返す）
 *   2. Topic ヘッダを全件列挙（GSI-TOPIC 経由）
 *   3. 各ヘッダと発話 embedding の cosine similarity を計算し、閾値以上を降順ソート →
 *      上位 topK 件を direct として選抜
 *   4. direct に含まれない各ヘッダについて、direct 集合との cosine 最大値を計算し、
 *      閾値以上のものを上位 relatedMax 件まで related として追加（1 ホップ関連展開）
 *   5. 選抜 Topic（direct → related の順）それぞれについて SELF/WEB fact を束ねて返す
 *
 * cooldown・カテゴリキャップ・care 下駄・常時注入（素性）は P2 では実装しない
 * （想起切替＝関連度 only、design §2.4/§3.3 参照）。
 */
export class TopicRetriever implements ITopicRetriever {
  private readonly topicRepository: TopicRepository;
  private readonly embeddingClient: IEmbeddingClient;

  constructor(topicRepository: TopicRepository, embeddingClient: IEmbeddingClient) {
    this.topicRepository = topicRepository;
    this.embeddingClient = embeddingClient;
  }

  public async retrieve(
    userId: string,
    characterId: string,
    options: TopicRetrieveOptions
  ): Promise<RetrievedTopic[]> {
    const { userInput, threshold, topK, relatedThreshold, relatedMax } = options;

    // 1. ユーザー入力の embedding 生成（失敗時は fail-warn で空配列、会話はブロックしない）
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingClient.embed(userInput);
    } catch (err) {
      logger.warn('[topic-retrieval] embedding 生成に失敗しました（想起なしで継続）', { err });
      return [];
    }

    // 2. Topic ヘッダ全件列挙（GSI-TOPIC 経由）
    let headers: TopicEntity[];
    try {
      headers = await this.topicRepository.listTopicHeaders(userId, characterId);
    } catch (err) {
      logger.warn('[topic-retrieval] Topic ヘッダの列挙に失敗しました（想起なしで継続）', { err });
      return [];
    }
    if (headers.length === 0) return [];

    // 3. direct 選抜: 発話 embedding との cosine が閾値以上を降順ソート → 上位 topK
    const scored: ScoredHeader[] = headers.map((header) => ({
      header,
      similarity: cosineSimilarity(queryEmbedding, header.Embedding),
    }));

    const direct = scored
      .filter((s) => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    const directTopicIds = new Set(direct.map((s) => s.header.TopicID));

    // 4. related 選抜: direct に含まれないヘッダについて、direct 集合との cosine 最大値を計算し
    //    閾値以上のものを上位 relatedMax 件まで追加（1 ホップ関連展開）
    const relatedCandidates: ScoredHeader[] = [];
    if (direct.length > 0) {
      for (const s of scored) {
        if (directTopicIds.has(s.header.TopicID)) continue;
        let maxSimilarity = -Infinity;
        for (const d of direct) {
          const sim = cosineSimilarity(d.header.Embedding, s.header.Embedding);
          if (sim > maxSimilarity) maxSimilarity = sim;
        }
        if (maxSimilarity >= relatedThreshold) {
          relatedCandidates.push({ header: s.header, similarity: maxSimilarity });
        }
      }
    }
    const related = relatedCandidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, relatedMax);

    // 5. 選抜 Topic（direct → related の順）の SELF/WEB fact を束ねて返す
    const results: RetrievedTopic[] = [];
    for (const { header, similarity } of [...direct, ...related]) {
      const via: 'direct' | 'related' = directTopicIds.has(header.TopicID) ? 'direct' : 'related';
      try {
        const bundle = await this.topicRepository.getTopicBundle({
          userId,
          characterId,
          topicId: header.TopicID,
        });
        results.push({
          topic: bundle.topic ?? header,
          selfFacts: bundle.selfFacts,
          webFacts: bundle.webFacts,
          similarity,
          via,
        });
      } catch (err) {
        logger.warn(
          '[topic-retrieval] Topic バンドルの取得に失敗しました（この Topic をスキップ）',
          {
            err,
            topicId: header.TopicID,
          }
        );
      }
    }

    // 観測ログ（threshold/topK/related の効果を観測するための最小限。fact 本文は載せない）
    logger.info('[topic-retrieval] recall', {
      userId,
      characterId,
      headerCount: headers.length,
      directCount: direct.length,
      relatedCount: related.length,
      topSimilarities: scored
        .map((s) => Math.round(s.similarity * 1000) / 1000)
        .sort((a, b) => b - a)
        .slice(0, topK),
    });

    return results;
  }
}
