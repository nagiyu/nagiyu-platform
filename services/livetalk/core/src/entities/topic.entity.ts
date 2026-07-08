/**
 * Topic 中心モデルのヘッダ(META) アイテム（リブトーク知識再設計 P1 / #3697）。
 *
 * 知識・記憶を Topic 単位で集約する新モデルの土台。SELF fact（`SelfFactEntity`）・
 * WEB fact（`WebFactEntity`）を束ね、正規化要約・カテゴリ・ケアスコア・座標
 * （Embedding）を 1 item に同居させる。座標は別 item に切り出さない。
 *
 * P1 は「影で構築」するのみで、既存の想起・memory 画面には一切接続しない
 * （既存の Memory / Knowledge 等は削除・変更しない）。
 *
 * DynamoDB SK: `CHAR#<charId>#TOPIC#<topicId>#META`
 * GSI3（GSI-TOPIC）: この META item のみを sparse 索引化し、Topic ヘッダの
 * 列挙・care 降順取得に使う（`#META` は SK の接尾辞のため begins_with では
 * 列挙できないため）。
 */
export interface TopicEntity {
  UserID: string;
  CharacterID: string;
  /** Topic ID（ULID。ランダム採番のため時系列ソートには使わない。usecase 側で発行する） */
  TopicID: string;
  /** Topic の主題（短い名詞句） */
  Subject: string;
  /** 正規化された要約文 */
  CanonicalSummary: string;
  /** カテゴリ */
  Category: string;
  /** ケアスコア（想起優先度）。GSI3SK にそのまま使う */
  Care: number;
  /** 埋め込みベクトル（座標）。Topic 本体(META)に同居させる */
  Embedding: number[];
  CreatedAt: number;
  UpdatedAt: number;
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
 * Topic 作成/更新入力（`CreatedAt` / `UpdatedAt` はリポジトリ側で付与）。
 *
 * TopicID は ULID（ランダム）で usecase 側が発行するため、ここでは省略不可とする
 * （Message 等と異なり、この層では採番方針を固定するだけ）。
 */
export type CreateTopicInput = Omit<TopicEntity, 'CreatedAt' | 'UpdatedAt'>;
