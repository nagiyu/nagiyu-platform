/**
 * EntityStore の DynamoDB 版と InMemory 版が共有する処理。
 * 両実装で式の組み立てやエラー変換がずれないよう一箇所に置く。
 */

import { DatabaseError, InvalidEntityDataError, RepositoryError } from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
  EntityPatch,
} from '../mapper/entity-mapper.interface.js';

/** 更新日時の属性名 */
export const UPDATED_AT_ATTRIBUTE = 'UpdatedAt';

export const ENTITY_STORE_ERROR_MESSAGES = {
  UPDATE_RESULT_MISSING: '更新後のデータを取得できませんでした',
  CONVERT_FAILED: 'データを変換できませんでした',
  MAPPER_FAILED: 'mapper の処理に失敗しました',
  KEY_ATTRIBUTE_UPDATE: 'キー属性は更新できません',
  ITEM_KEY_MISMATCH: 'Item のキー属性が buildKeys の結果と一致しません',
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
 * create / put で書く Item を用意する。`UpdatedAt` は store が now で上書きする。
 *
 * toItem がキー属性を欠く、または buildKeys と値が食い違うと、DynamoDB は ValidationException で
 * 拒否する。InMemory 版でも同じ結果になるよう、DatabaseError で両実装に同じ失敗をさせる。
 * mapper の実装ミスだが、実 DynamoDB での見え方に合わせるのが InMemory 版の役割のため。
 */
export function prepareWriteItem<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  entity: TEntity,
  now: number
): { keys: DynamoDBKey; item: DynamoDBAttributes } {
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
    () => mapper.toUpdateAttributes(changes),
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
