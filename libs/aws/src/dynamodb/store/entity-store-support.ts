/**
 * EntityStore の DynamoDB 版と InMemory 版が共有する処理。
 * 両実装で式の組み立てやエラー変換がずれないよう一箇所に置く。
 */

import { InvalidEntityDataError, RepositoryError } from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';
import type {
  DynamoDBAttributes,
  DynamoDBKey,
  EntityMapper,
} from '../mapper/entity-mapper.interface.js';
import type { EntityUpdateAttributes } from './entity-store.interface.js';

/** 更新日時の属性名 */
export const UPDATED_AT_ATTRIBUTE = 'UpdatedAt';

export const ENTITY_STORE_ERROR_MESSAGES = {
  UPDATE_RESULT_MISSING: '更新後のデータを取得できませんでした',
  CONVERT_FAILED: 'データを変換できませんでした',
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
 * update の attributes から、書き込む属性の一覧を組み立てる。
 *
 * - undefined の項目は捨てる
 * - `UpdatedAt` は store が管理するため呼び出し側の指定は無視する
 * - 新名を書く (SET でも REMOVE でも) ときは旧名を REMOVE して二重に残さない
 */
export function buildUpdateFields(
  mapper: Pick<EntityMapper<unknown, unknown>, 'legacyAttributeNames'>,
  attributes: EntityUpdateAttributes
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || name === UPDATED_AT_ATTRIBUTE) {
      continue;
    }
    fields[name] = value;
  }

  const legacy = mapper.legacyAttributeNames ?? {};
  for (const name of [...Object.keys(fields), UPDATED_AT_ATTRIBUTE]) {
    for (const legacyName of legacy[name] ?? []) {
      if (!(legacyName in fields)) {
        fields[legacyName] = REMOVE_ATTRIBUTE;
      }
    }
  }
  return fields;
}

/**
 * Item を Entity に変換する。
 * mapper が RepositoryError 以外を投げても、呼び出し側には読めないデータとして一貫して見せる。
 */
export function convertToEntity<TEntity, TKey>(
  mapper: EntityMapper<TEntity, TKey>,
  item: DynamoDBAttributes
): TEntity {
  try {
    return mapper.toEntity(item);
  } catch (error) {
    if (error instanceof RepositoryError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new InvalidEntityDataError(`${ENTITY_STORE_ERROR_MESSAGES.CONVERT_FAILED}: ${reason}`);
  }
}
