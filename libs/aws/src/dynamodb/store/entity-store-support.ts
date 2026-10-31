/**
 * EntityStore の DynamoDB 版と InMemory 版が共有する処理。
 * 両実装で式の組み立てやエラー変換がずれないよう一箇所に置く。
 */

import {
  DatabaseError,
  EntityAlreadyExistsError,
  InvalidEntityDataError,
  OptimisticLockError,
  RepositoryError,
} from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
  EntityPatch,
} from '../mapper/entity-mapper.interface.js';
import type {
  CreateIfAbsentResult,
  EntityCreateInput,
  EntityCreateOptions,
  EntityPutInput,
} from './entity-store.interface.js';

/** 更新日時の属性名 */
export const UPDATED_AT_ATTRIBUTE = 'UpdatedAt';

export const ENTITY_STORE_ERROR_MESSAGES = {
  UPDATE_RESULT_MISSING: '更新後のデータを取得できませんでした',
  CONVERT_FAILED: 'データを変換できませんでした',
  MAPPER_FAILED: 'mapper の処理に失敗しました',
  KEY_ATTRIBUTE_UPDATE: 'キー属性は更新できません',
  ITEM_KEY_MISMATCH: 'Item のキー属性が buildKeys の結果と一致しません',
  CREATE_CONFLICT_ITEM_MISSING: '作成が衝突しましたが、既存のデータが見つかりません',
} as const;

/** パーティションキーの属性名。キー属性の先頭を使う規約 */
export function getPartitionKeyName(keys: DynamoDBKey): string {
  return Object.keys(keys)[0];
}

/** エラーメッセージ用のキー表記 */
export function describeKey(keys: DynamoDBKey): string {
  return Object.values(keys).join('#');
}

/**
 * mapper の処理を実行する。
 * RepositoryError 以外の例外は InvalidEntityDataError にし、両実装で mapper の素の例外の見え方を揃える。
 */
export function runMapper<T>(action: () => T, message: string): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidEntityDataError(`${message}: ${reason}`);
  }
}

/** Item を Entity に変換する */
export function convertToEntity<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  item: DynamoDBAttributes
): TEntity {
  return runMapper(() => mapper.toEntity(item), ENTITY_STORE_ERROR_MESSAGES.CONVERT_FAILED);
}

/** ビジネスキーから DynamoDB の Key を構築する */
export function resolveKeys<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  key: TKey
): DynamoDBKey {
  return runMapper(() => mapper.buildKeys(key), ENTITY_STORE_ERROR_MESSAGES.MAPPER_FAILED);
}

/**
 * create / put で書く Item を用意する。
 *
 * 時刻は呼び出し側が 1 回だけ読んだ `now` を使い、`createdAt` の省略時の値と `UpdatedAt` の両方を同じ値にする。
 * `updatedAt` は呼び出し側の指定を無視し、必ず `now` で上書きする。
 * Entity に無いフィールドが乗っても、mapper の toItem が属性を個別に書くため Item には漏れない。
 *
 * toItem がキー属性を欠く、または buildKeys と値が食い違うと、DynamoDB は ValidationException で
 * 拒否する。InMemory 版でも同じ結果になるよう、DatabaseError で両実装に同じ失敗をさせる。
 * mapper の実装ミスだが、実 DynamoDB での見え方に合わせるのが InMemory 版の役割のため。
 */
export function prepareWriteItem<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  input: EntityCreateInput<TEntity> | EntityPutInput<TEntity>,
  now: number
): { keys: DynamoDBKey; item: DynamoDBAttributes } {
  // Entity に createdAt が無い型では、足した値は toItem が読まない限り Item に出ない
  const createdAt = (input as { createdAt?: unknown }).createdAt ?? now;
  const entity = { ...input, createdAt, updatedAt: now } as unknown as TEntity;
  const keys = runMapper(
    () => mapper.buildKeys(mapper.getKey(entity)),
    ENTITY_STORE_ERROR_MESSAGES.MAPPER_FAILED
  );
  const item: DynamoDBAttributes = {
    ...runMapper(() => mapper.toItem(entity), ENTITY_STORE_ERROR_MESSAGES.MAPPER_FAILED),
    [UPDATED_AT_ATTRIBUTE]: now,
  };
  for (const [name, value] of Object.entries(keys)) {
    if (item[name] !== value) {
      throw new DatabaseError(`${ENTITY_STORE_ERROR_MESSAGES.ITEM_KEY_MISMATCH}: ${name}`);
    }
  }
  return { keys, item };
}

/**
 * update で書き込む属性の一覧を組み立てる。
 *
 * - undefined の項目は捨てる
 * - `UpdatedAt` は store が管理するため呼び出し側の指定は無視する
 * - キー属性が含まれていたら InvalidEntityDataError
 * - 新名を書く (SET でも REMOVE でも) ときは旧名を REMOVE して二重に残さない。
 *   ただし旧名が `UpdatedAt` やキー属性名と同じ場合は、それらを消さないよう対象から外す
 */
export function planUpdate<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  key: TKey,
  changes: EntityPatch<TEntity>
): { keys: DynamoDBKey; fields: Record<string, unknown> } {
  const keys = resolveKeys(mapper, key);
  const attributes = runMapper(
    () => mapper.toUpdateAttributes(changes, key),
    ENTITY_STORE_ERROR_MESSAGES.MAPPER_FAILED
  );

  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || name === UPDATED_AT_ATTRIBUTE) {
      continue;
    }
    if (name in keys) {
      throw new InvalidEntityDataError(
        `${ENTITY_STORE_ERROR_MESSAGES.KEY_ATTRIBUTE_UPDATE}: ${name}`
      );
    }
    fields[name] = value;
  }

  const protectedNames = new Set([UPDATED_AT_ATTRIBUTE, ...Object.keys(keys)]);
  const legacy = mapper.legacyAttributeNames ?? {};
  for (const name of [...Object.keys(fields), UPDATED_AT_ATTRIBUTE]) {
    for (const legacyName of legacy[name] ?? []) {
      if (!protectedNames.has(legacyName) && !(legacyName in fields)) {
        fields[legacyName] = REMOVE_ATTRIBUTE;
      }
    }
  }
  return { keys, fields };
}

/**
 * create の衝突で投げるエラーを選ぶ。
 * `conflictAsOptimisticLock` のときは新しいエラー型を増やさず、更新の衝突と同じ `OptimisticLockError` にする。
 */
export function createConflictError(
  entityType: string,
  keys: DynamoDBKey,
  options: EntityCreateOptions
): EntityAlreadyExistsError | OptimisticLockError {
  const identifier = describeKey(keys);
  return options.conflictAsOptimisticLock
    ? new OptimisticLockError(entityType, identifier)
    : new EntityAlreadyExistsError(entityType, identifier);
}

/**
 * createIfAbsent の流れ。作成に失敗したら既存を読み直して返す。
 *
 * 読み直しは書き込み直後の衝突相手を確実に拾うため、呼び出し側が強い整合性で読む。
 * 衝突と読み直しの間に削除された場合は、作成も既存の取得もできていないため DatabaseError にする。
 *
 * @param insert - 無いときだけ書く。既にあれば EntityAlreadyExistsError を投げる
 * @param readExisting - 既存を読む
 */
export async function createOrReadExisting<TEntity>(
  insert: () => Promise<TEntity>,
  readExisting: () => Promise<TEntity | null>
): Promise<CreateIfAbsentResult<TEntity>> {
  try {
    return { entity: await insert(), created: true };
  } catch (error) {
    if (!(error instanceof EntityAlreadyExistsError)) {
      throw error;
    }
    const existing = await readExisting();
    if (!existing) {
      throw new DatabaseError(ENTITY_STORE_ERROR_MESSAGES.CREATE_CONFLICT_ITEM_MISSING, error);
    }
    return { entity: existing, created: false };
  }
}
