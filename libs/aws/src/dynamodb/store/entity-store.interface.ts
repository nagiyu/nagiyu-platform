import type { EntityPatch } from '../mapper/entity-mapper.interface.js';

/** get のオプション */
export interface EntityReadOptions {
  /** 強い整合性で読む。DynamoDB 版は ConsistentRead に渡し、InMemory 版は無視する */
  consistentRead?: boolean;
}

/** put / update の楽観ロックオプション */
export interface EntityWriteOptions {
  /**
   * 指定すると、既存の Item があり、保存済みの `UpdatedAt` がこの値と一致する場合だけ書き込む。
   * Item はあるが一致しなければ `OptimisticLockError`、Item がなければ `EntityNotFoundError`。
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
  get(key: TKey, options?: EntityReadOptions): Promise<TEntity | null>;

  /**
   * 新規作成する。実際に書いた Item を Entity に変換して返す。
   * `UpdatedAt` は store が現在時刻で設定する (`CreatedAt` は Entity の値のまま)。
   *
   * @throws EntityAlreadyExistsError 既に存在するとき
   */
  create(entity: TEntity): Promise<TEntity>;

  /**
   * 無ければ作り、あれば置き換える。実際に書いた Item を Entity に変換して返す。
   * `UpdatedAt` は store が現在時刻で設定する (`CreatedAt` は Entity の値のまま)。
   *
   * @throws EntityNotFoundError `expectedUpdatedAt` を指定して既存がないとき
   * @throws OptimisticLockError `expectedUpdatedAt` を指定して一致しないとき
   */
  put(entity: TEntity, options?: EntityWriteOptions): Promise<TEntity>;

  /**
   * Entity の部分 (camelCase) で更新し、更新後の Entity を返す。
   * 値の意味は `EntityPatch` の規約に従う (undefined は変更なし、null は属性削除)。
   * `UpdatedAt` は store が現在時刻で更新し、更新項目が 1 件もなければ `UpdatedAt` だけを更新する。
   *
   * @throws EntityNotFoundError 存在しないとき
   * @throws OptimisticLockError `expectedUpdatedAt` を指定し、Item はあるが一致しないとき。
   *   DynamoDB の条件失敗は `ALL_OLD` で旧 Item の有無を返すため、不在と不一致を区別できる
   * @throws InvalidEntityDataError `toUpdateAttributes` の結果にキー属性が含まれるとき
   */
  update(key: TKey, changes: EntityPatch<TEntity>, options?: EntityWriteOptions): Promise<TEntity>;

  /**
   * 存在を条件に削除する。
   *
   * @throws EntityNotFoundError 存在しないとき
   */
  delete(key: TKey): Promise<void>;

  /** 無条件に削除する。存在しなくても成功する */
  deleteIfExists(key: TKey): Promise<void>;
}
