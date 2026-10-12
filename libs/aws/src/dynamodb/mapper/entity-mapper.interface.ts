/** DynamoDB の `Key` にそのまま渡せるキーオブジェクト */
export type DynamoDBKey = Record<string, string | number>;

/** DynamoDB の Item 全体 (属性名 → 値) */
export type DynamoDBAttributes = Record<string, unknown>;

/**
 * Entity ↔ DynamoDB Item の変換を担当する Mapper
 *
 * 変換をすべてここに集約し、CRUD の骨格は `EntityStore` が受け持つ。
 *
 * @template TEntity - ビジネスオブジェクト
 * @template TKey - エンティティを一意に識別するキー
 */
export interface EntityMapper<TEntity, TKey> {
  /** Type 属性の値。エラーメッセージにも使う */
  readonly entityType: string;

  /**
   * 新属性名 → 旧属性名の一覧。
   *
   * 更新で新名を SET するとき、旧名を同時に REMOVE して二重に残さないために使う。
   */
  readonly legacyAttributeNames?: Readonly<Record<string, readonly string[]>>;

  /**
   * ビジネスキーから DynamoDB の `Key` を構築する。
   *
   * 戻り値のキー属性の並び順には意味がある: 先頭をパーティションキー、
   * 2 番目以降をソートキーとして扱い、条件式の存在チェック
   * (`attribute_exists` / `attribute_not_exists`) には先頭の属性名を使う。
   * 例: `{ PK, SK }` は PK が先頭、`{ userId }` は userId が先頭。
   * パーティションキーはテーブルの全 Item に必須のため、存在判定に使える。
   */
  buildKeys(key: TKey): DynamoDBKey;

  /** Entity からビジネスキーを取り出す */
  getKey(entity: TEntity): TKey;

  /** キー・Type・タイムスタンプを含む完全な Item に変換する */
  toItem(entity: TEntity): DynamoDBAttributes;

  /**
   * Item を検証しつつ Entity に変換する。旧形式 (旧属性名・ISO 文字列・エポック秒) も受け付ける。
   *
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  toEntity(item: DynamoDBAttributes): TEntity;
}
