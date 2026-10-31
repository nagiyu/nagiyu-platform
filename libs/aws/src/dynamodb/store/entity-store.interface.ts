import type { EntityPatch } from '../mapper/entity-mapper.interface.js';

/**
 * create に渡す入力。`updatedAt` は store が書き込み時に決めるため持たない。
 *
 * Entity に `createdAt` があるときだけ省略可能な `createdAt` を受け取り、
 * 省略した場合は store が `UpdatedAt` と同じ現在時刻で埋める。
 */
export type EntityCreateInput<TEntity> = Omit<TEntity, 'createdAt' | 'updatedAt'> &
  ('createdAt' extends keyof TEntity ? { createdAt?: TEntity['createdAt'] } : unknown);

/**
 * put に渡す入力。`updatedAt` は store が書き込み時に決めるため持たない。
 *
 * Entity に `createdAt` があるときは、キーの書き忘れを型エラーにするため `createdAt` を必須にする。
 * put は Item 全体の置き換えで、書き忘れると既存の `CreatedAt` が黙って消えるため。
 * 既存を引き継ぐなら `existing?.createdAt` を渡し、`undefined` なら store が現在時刻で埋める。
 */
export type EntityPutInput<TEntity> = Omit<TEntity, 'createdAt' | 'updatedAt'> &
  ('createdAt' extends keyof TEntity ? { createdAt: TEntity['createdAt'] | undefined } : unknown);

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

/** create のオプション */
export interface EntityCreateOptions {
  /**
   * true のとき、既に存在する場合に `EntityAlreadyExistsError` ではなく `OptimisticLockError` を投げる。
   *
   * 呼び出し側が「読んだ時点では無かった」を前提に作成する楽観ロックの一種で、
   * 作成の衝突を更新の衝突と同じ扱い (再読込して再試行) にしたいときに使う。
   */
  conflictAsOptimisticLock?: boolean;
}

/** createIfAbsent の結果 */
export interface CreateIfAbsentResult<TEntity> {
  /** 作成できたときは書いた値、既に存在したときは既存の値 */
  entity: TEntity;
  /** 今回の呼び出しで作成したか */
  created: boolean;
}

/** updateIfAttributeAbsent の結果 */
export interface UpdateIfAttributeAbsentResult<TEntity> {
  /** 更新したときは更新後の値、属性が設定済みで書かなかったときは既存の値 */
  entity: TEntity;
  /** 今回の呼び出しで更新したか */
  updated: boolean;
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
   * `UpdatedAt` は store が現在時刻で設定する。`createdAt` を省略すると同じ時刻で埋める。
   *
   * @throws EntityAlreadyExistsError 既に存在するとき
   * @throws OptimisticLockError `conflictAsOptimisticLock` を指定して既に存在するとき
   */
  create(input: EntityCreateInput<TEntity>, options?: EntityCreateOptions): Promise<TEntity>;

  /**
   * 無ければ作り、あれば書かずに既存を返す。
   * 作成できなかったときは、強い整合性で読み直した既存の値を返す。
   * 作成と同じく `UpdatedAt` は store が現在時刻で設定し、`createdAt` を省略すると同じ時刻で埋める。
   *
   * @throws DatabaseError 既に存在して作成できなかったが、読み直しで見つからないとき (間に削除された)
   */
  createIfAbsent(input: EntityCreateInput<TEntity>): Promise<CreateIfAbsentResult<TEntity>>;

  /**
   * 無ければ作り、あれば置き換える。実際に書いた Item を Entity に変換して返す。
   * `UpdatedAt` は store が現在時刻で設定する。`createdAt` が `undefined` なら同じ時刻で埋める。
   *
   * @throws EntityNotFoundError `expectedUpdatedAt` を指定して既存がないとき
   * @throws OptimisticLockError `expectedUpdatedAt` を指定して一致しないとき
   */
  put(input: EntityPutInput<TEntity>, options?: EntityWriteOptions): Promise<TEntity>;

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
   * Item があり、指定した属性が未設定のときだけ `update` と同じ内容で更新する。
   * 属性が設定済みなら書かずに既存の Entity を返す。
   *
   * `attributeName` は DynamoDB の属性名 (例: `Outcome`)。Entity のフィールド名ではない。
   * mapper にフィールド名から属性名への汎用の対応がないため、呼び出し側が属性名で指定する。
   * 更新内容の組み立て (`UpdatedAt` の扱い、キー属性のガード、旧名の削除) は `update` と同じ。
   *
   * @throws EntityNotFoundError 存在しないとき
   * @throws InvalidEntityDataError `toUpdateAttributes` の結果にキー属性が含まれるとき
   */
  updateIfAttributeAbsent(
    key: TKey,
    attributeName: string,
    changes: EntityPatch<TEntity>
  ): Promise<UpdateIfAttributeAbsentResult<TEntity>>;

  /**
   * 存在を条件に削除する。
   *
   * @throws EntityNotFoundError 存在しないとき
   */
  delete(key: TKey): Promise<void>;

  /** 無条件に削除する。存在しなくても成功する */
  deleteIfExists(key: TKey): Promise<void>;
}
