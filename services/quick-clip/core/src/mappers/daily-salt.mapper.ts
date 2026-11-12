import {
  InvalidEntityDataError,
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  readOptionalTimestamp,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { DailySalt, DailySaltKey } from '../types.js';
import { SALT_ITEM_TYPE, buildSaltKey } from './usage-keys.js';

/** キー (PK) の接頭辞。日付はここから読み戻す */
const SALT_PK_PREFIX = 'USAGE_SALT#';

const ERROR_MESSAGES = {
  INVALID_KEY: '塩のキーから日付を読み取れませんでした',
} as const;

/**
 * 日次の塩の Mapper
 *
 * 塩は作ったあとに変えない。変えると、同じ日の途中で同じ利用者のハッシュが変わってしまう。
 * タイムスタンプを書く前の Item は CreatedAt / UpdatedAt を持たないため、読み取りは無くても受ける。
 */
export class DailySaltMapper implements EntityMapper<DailySalt, DailySaltKey> {
  public readonly entityType = SALT_ITEM_TYPE;

  public buildKeys(key: DailySaltKey): DynamoDBKey {
    return buildSaltKey(key.day);
  }

  public getKey(entity: DailySalt): DailySaltKey {
    return { day: entity.day };
  }

  public toItem(entity: DailySalt): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      Salt: entity.salt,
      [TTL_ATTRIBUTE_NAME]: entity.ttlSec,
    };
    if (entity.createdAt !== undefined) {
      item.CreatedAt = entity.createdAt;
    }
    return item;
  }

  /**
   * 塩は作成後に変えないため、変更の指定はすべて拒否する。
   *
   * @throws InvalidEntityDataError 変更する項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<DailySalt>): DynamoDBAttributes {
    return {
      Salt: immutablePatchValue(changes.salt, 'Salt'),
      [TTL_ATTRIBUTE_NAME]: immutablePatchValue(changes.ttlSec, TTL_ATTRIBUTE_NAME),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
    };
  }

  /**
   * @throws InvalidEntityDataError Salt が文字列でないとき、または PK から日付を読み取れないとき
   */
  public toEntity(item: DynamoDBAttributes): DailySalt {
    const entity: DailySalt = {
      day: this.readDay(item.PK),
      salt: validateStringField(item.Salt, 'Salt'),
      ttlSec: validateNumberField(item[TTL_ATTRIBUTE_NAME], TTL_ATTRIBUTE_NAME),
    };
    const createdAt = readOptionalTimestamp(item, 'CreatedAt');
    if (createdAt !== undefined) {
      entity.createdAt = createdAt;
    }
    return entity;
  }

  private readDay(pk: unknown): string {
    if (typeof pk !== 'string' || !pk.startsWith(SALT_PK_PREFIX)) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_KEY);
    }
    return pk.slice(SALT_PK_PREFIX.length);
  }
}
