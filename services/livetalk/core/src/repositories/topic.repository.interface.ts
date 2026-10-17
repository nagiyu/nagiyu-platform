import type {
  CreateSelfFactInput,
  SelfFactEntity,
  SelfFactKey,
} from '../entities/self-fact.entity.js';
import type { CreateTopicInput, TopicEntity, TopicKey } from '../entities/topic.entity.js';
import type { CreateWebFactInput, WebFactEntity, WebFactKey } from '../entities/web-fact.entity.js';

/**
 * `getTopicBundle` の返り値。1 Topic 分（META + SELF 全部 + WEB 全部）を束ねる。
 */
export interface TopicBundle {
  topic: TopicEntity | null;
  selfFacts: SelfFactEntity[];
  webFacts: WebFactEntity[];
}

/**
 * Topic（ヘッダ・META）+ SELF fact + WEB fact を扱う統合リポジトリ。
 */
export interface TopicRepository {
  /**
   * Topic ヘッダ(META) を保存する。
   *
   * - 新規作成時（`opts.expectedUpdatedAt` 未指定）: 既に存在すれば `OptimisticLockError` を投げる。
   * - 更新時（`opts.expectedUpdatedAt` 指定）: 保存済みの `updatedAt` と一致するときだけ書き込む
   *   （忘却の要約再生成と consolidation の書き込み競合を検知するため）。
   *   一致しなければ `OptimisticLockError`、Topic が存在しなければ `EntityNotFoundError` を投げる。
   */
  putTopic(input: CreateTopicInput, opts?: { expectedUpdatedAt?: number }): Promise<TopicEntity>;

  /** 単一 Topic ヘッダを取得する。存在しなければ null。 */
  getTopic(key: TopicKey): Promise<TopicEntity | null>;

  /**
   * 1 Topic 分（META + SELF 全部 + WEB 全部）を 1 Query で束ねて取得する。
   */
  getTopicBundle(key: TopicKey): Promise<TopicBundle>;

  /**
   * キャラ単位の Topic ヘッダを全件列挙する（GSI3 経由）。想起の座標列挙用。
   * `#META` は begins_with で列挙できないため、必ず GSI3 を Query する。
   */
  listTopicHeaders(userId: string, characterId: string): Promise<TopicEntity[]>;

  /**
   * キャラ単位の Topic ヘッダを care 降順で取得する（GSI3 経由、acquire 用）。
   */
  listTopicHeadersByCareDesc(
    userId: string,
    characterId: string,
    limit: number
  ): Promise<TopicEntity[]>;

  /** SELF fact を保存する。`factId` 未指定なら ULID を自動採番する。 */
  putSelfFact(input: CreateSelfFactInput): Promise<SelfFactEntity>;

  /** Topic 配下の SELF fact を全件返す。 */
  listSelfFacts(userId: string, characterId: string, topicId: string): Promise<SelfFactEntity[]>;

  /**
   * SELF fact を削除する。
   *
   * @throws EntityNotFoundError 対象の SELF fact が存在しないとき
   */
  deleteSelfFact(key: SelfFactKey): Promise<void>;

  /** WEB fact を保存する。`factId` 未指定なら ULID を自動採番する。 */
  putWebFact(input: CreateWebFactInput): Promise<WebFactEntity>;

  /** Topic 配下の WEB fact を全件返す。 */
  listWebFacts(userId: string, characterId: string, topicId: string): Promise<WebFactEntity[]>;

  /**
   * 鮮度切れの揮発 WEB fact を GSI4（GSI-STALE）で窓走査し、`nextReview <= nowMs`
   * のものを期限が古い順（昇順）に最大 `limit` 件返す（acquire 用）。
   *
   * stable fact（NextReview 未設定）は GSI4 に一切現れないため、掃引対象に含まれない。
   */
  listStaleWebFacts(
    userId: string,
    characterId: string,
    nowMs: number,
    limit: number
  ): Promise<WebFactEntity[]>;

  /**
   * 既存 WEB fact の `nextReview` を前方更新する（acquire の鮮度掃引用）。
   * GSI4SK も追随させ、次回掃引の窓から外す。対象が存在しなければ no-op。
   */
  updateWebFactNextReview(key: WebFactKey, nextReview: number): Promise<void>;
}
