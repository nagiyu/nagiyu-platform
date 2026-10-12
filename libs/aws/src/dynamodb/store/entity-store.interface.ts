/**
 * update で書き換える属性。キーは DynamoDB 上の属性名、値は新しい値。
 * 値が `REMOVE_ATTRIBUTE` なら属性を削除し、`undefined` の項目は無視する。
 */
export type EntityUpdateAttributes = Record<string, unknown>;

/** put / update の楽観ロックオプション */
export interface EntityWriteOptions {
  /**
   * 指定すると、保存済みの `UpdatedAt` がこの値と一致する場合だけ書き込む。
   * 一致しなければ `OptimisticLockError`。
   *
   * 比較は保存されている値そのもの (数値ミリ秒) に対して行うため、
   * 旧形式 (ISO 文字列・エポック秒) のまま残っている Item は一致せず
   * `OptimisticLockError` になる。
   */
  expectedUpdatedAt?: number;
}

/**
 * Entity 単位の CRUD 操作。
 *
 * 実装は DynamoDB 版と InMemory 版があり、同じ操作で同じエラーを投げる。
 */
export interface EntityStore<TEntity, TKey> {
  /**
   * キーで取得する。なければ null。
   *
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  get(key: TKey): Promise<TEntity | null>;

  /**
   * 新規作成する。作成した Entity を返す。
   *
   * @throws EntityAlreadyExistsError 既に存在するとき
   */
  create(entity: TEntity): Promise<TEntity>;

  /**
   * 無ければ作り、あれば置き換える。Entity を返す。
   *
   * @throws OptimisticLockError `expectedUpdatedAt` を指定し、既存がない、または一致しないとき
   */
  put(entity: TEntity, options?: EntityWriteOptions): Promise<TEntity>;

  /**
   * 指定した属性だけを更新し、更新後の Entity を返す。`UpdatedAt` は store が現在時刻で更新する。
   * 更新項目が 1 件もなければ `UpdatedAt` だけを更新する。
   *
   * @throws EntityNotFoundError 存在しないとき
   * @throws OptimisticLockError `expectedUpdatedAt` を指定して条件を満たさないとき。
   *   DynamoDB は条件失敗の理由 (不在か不一致か) を区別できないため、
   *   この場合は不在も `OptimisticLockError` に寄せる
   */
  update(
    key: TKey,
    attributes: EntityUpdateAttributes,
    options?: EntityWriteOptions
  ): Promise<TEntity>;

  /**
   * 存在を条件に削除する。
   *
   * @throws EntityNotFoundError 存在しないとき
   */
  delete(key: TKey): Promise<void>;

  /** 無条件に削除する。存在しなくても成功する */
  deleteIfExists(key: TKey): Promise<void>;
}
