/** DynamoDB の `Key` にそのまま渡せるキーオブジェクト */
export type DynamoDBKey = Record<string, string | number>;

/** DynamoDB の Item 全体 (属性名 → 値) */
export type DynamoDBAttributes = Record<string, unknown>;

/**
 * update に渡す Entity の部分。
 *
 * 値の意味は全 mapper で共通: `undefined` は変更しない、`null` は属性を削除する、
 * それ以外は新しい値。
 */
export type EntityPatch<TEntity> = { [K in keyof TEntity]?: TEntity[K] | null };

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
   * `EntityPatch` を保存用の属性名・形式に変換する。
   *
   * ミリ秒・TTL の秒への換算や GSI 属性の再計算など、保存形式への変換はここで行う。
   * patch の値が `null` の項目は `REMOVE_ATTRIBUTE` にし、`undefined` の項目は含めない。
   * キー属性と `UpdatedAt` は store が管理するため、キー属性を含めると store が
   * `InvalidEntityDataError` にする (`UpdatedAt` は無視される)。
   *
   * `key` は更新対象のビジネスキー。キーから作る属性 (GSI のキーなど) を付け直すために使う。
   * patch に識別子を混ぜなくても、更新で GSI 属性を保てる。ただし `key` から作った値でも、
   * キー属性そのもの (`buildKeys` の結果) は返してはいけない。
   * キー属性を使わない mapper は第 2 引数を省略して実装してよい。
   */
  toUpdateAttributes(changes: EntityPatch<TEntity>, key: TKey): DynamoDBAttributes;

  /**
   * Item を検証しつつ Entity に変換する。旧形式 (旧属性名・ISO 文字列・エポック秒) も受け付ける。
   *
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  toEntity(item: DynamoDBAttributes): TEntity;
}
