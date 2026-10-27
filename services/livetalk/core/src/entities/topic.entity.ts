/**
 * Topic 中心モデルのヘッダ(META) アイテム。
 *
 * 知識・記憶を Topic 単位で集約する。SELF fact（`SelfFactEntity`）・
 * WEB fact（`WebFactEntity`）を束ね、正規化要約・カテゴリ・ケアスコア・座標
 * （embedding）を 1 item に同居させる。座標は別 item に切り出さない。
 *
 * DynamoDB SK: `CHAR#<charId>#TOPIC#<topicId>#META`
 * GSI3（GSI-TOPIC）: この META item のみを sparse 索引化し、Topic ヘッダの
 * 列挙・care 降順取得に使う（`#META` は SK の接尾辞のため begins_with では
 * 列挙できないため）。
 */
export interface TopicEntity {
  userId: string;
  characterId: string;
  /** Topic ID（ULID。ランダム採番のため時系列ソートには使わない。usecase 側で発行する） */
  topicId: string;
  /** Topic の主題（短い名詞句） */
  subject: string;
  /** 正規化された要約文 */
  canonicalSummary: string;
  /** カテゴリ */
  category: string;
  /** ケアスコア（想起優先度）。GSI3SK にそのまま使う */
  care: number;
  /** 埋め込みベクトル（座標）。Topic 本体(META)に同居させる */
  embedding: number[];
  /**
   * 依頼由来の別信号。ユーザーが「〇〇調べて」と依頼した文言を
   * consolidation が突合できた場合のみ設定する。SELF fact とは独立しており、SELF フックが
   * 無い/使えない場合の generate-note の依頼フックに使う。
   */
  requestText?: string;
  /** 依頼日時（Unix ms）。`requestText` とセットで設定する。 */
  requestedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 単一 Topic を取得する際のキー。
 */
export interface TopicKey {
  userId: string;
  characterId: string;
  topicId: string;
}

/**
 * Topic 作成/更新入力（`createdAt` / `updatedAt` はリポジトリ側で付与）。
 *
 * topicId は ULID（ランダム）で usecase 側が発行するため、ここでは省略不可とする
 * （Message 等と異なり、この層では採番方針を固定するだけ）。
 */
export type CreateTopicInput = Omit<TopicEntity, 'createdAt' | 'updatedAt'>;
