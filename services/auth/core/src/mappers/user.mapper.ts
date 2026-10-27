/**
 * Auth Core - User Mapper
 *
 * User ↔ DynamoDB Item の変換を担当
 */

import {
  InvalidEntityDataError,
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { User } from '@nagiyu/common';

/** ユーザーのビジネスキー */
export type UserKey = { userId: string };

const ERROR_MESSAGES = {
  ROLES_INVALID: 'フィールド "Roles" が不正です: 文字列の配列である必要があります',
} as const;

/**
 * 保存属性の旧名。
 *
 * 旧データは小文字始まりの属性名で保存されている。キー属性 (`userId`) と GSI のキー (`googleId`) は
 * テーブルを作り直さないと変えられないため据え置く。
 */
const LEGACY_ATTRIBUTE_NAMES = {
  Email: ['email'],
  Name: ['name'],
  Picture: ['picture'],
  Roles: ['roles'],
  CreatedAt: ['createdAt'],
  UpdatedAt: ['updatedAt'],
  LastLoginAt: ['lastLoginAt'],
} as const;

/**
 * User Mapper
 *
 * User と DynamoDB Item 間の変換を行う
 */
export class UserMapper implements EntityMapper<User, UserKey> {
  public readonly entityType = 'User';

  public readonly legacyAttributeNames = LEGACY_ATTRIBUTE_NAMES;

  public buildKeys(key: UserKey): DynamoDBKey {
    return { userId: key.userId };
  }

  public getKey(entity: User): UserKey {
    return { userId: entity.userId };
  }

  public toItem(entity: User): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      googleId: entity.googleId,
      Email: entity.email,
      Name: entity.name,
      Roles: entity.roles,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };

    if (entity.picture !== undefined) {
      item.Picture = entity.picture;
    }
    if (entity.lastLoginAt !== undefined) {
      item.LastLoginAt = entity.lastLoginAt;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * userId・googleId・createdAt は作成後に変えられないため、含めると拒否する。
   * googleId は GSI のキーなので、変えるとインデックスの引き当てが壊れる。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<User>): DynamoDBAttributes {
    return {
      userId: immutablePatchValue(changes.userId, 'userId'),
      googleId: immutablePatchValue(changes.googleId, 'googleId'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Email: requiredPatchValue(changes.email, 'Email'),
      Name: requiredPatchValue(changes.name, 'Name'),
      Roles: requiredPatchValue(changes.roles, 'Roles'),
      Picture: optionalPatchValue(changes.picture),
      LastLoginAt: optionalPatchValue(changes.lastLoginAt),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 新名を優先し、なければ旧名と ISO 文字列の時刻も読む。書き込まれないアイテムは
   * 旧形式のまま残るため、この互換処理は外さない。
   *
   * @param item - DynamoDB Item
   * @returns User
   * @throws InvalidEntityDataError 読めないデータのとき
   */
  public toEntity(item: DynamoDBAttributes): User {
    const entity: User = {
      userId: validateStringField(item.userId, 'userId'),
      googleId: validateStringField(item.googleId, 'googleId'),
      email: validateStringField(this.read(item, 'Email'), 'Email'),
      name: validateStringField(this.read(item, 'Name'), 'Name'),
      roles: this.validateRoles(this.read(item, 'Roles')),
      createdAt: readTimestamp(item, 'CreatedAt', LEGACY_ATTRIBUTE_NAMES.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', LEGACY_ATTRIBUTE_NAMES.UpdatedAt),
    };

    const picture = this.read(item, 'Picture');
    if (picture !== undefined) {
      entity.picture = validateStringField(picture, 'Picture', { allowEmpty: true });
    }
    const lastLoginAt = readOptionalTimestamp(
      item,
      'LastLoginAt',
      LEGACY_ATTRIBUTE_NAMES.LastLoginAt
    );
    if (lastLoginAt !== undefined) {
      entity.lastLoginAt = lastLoginAt;
    }

    return entity;
  }

  private read(item: DynamoDBAttributes, name: keyof typeof LEGACY_ATTRIBUTE_NAMES): unknown {
    return readAttribute(item, name, LEGACY_ATTRIBUTE_NAMES[name]);
  }

  private validateRoles(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((role) => typeof role !== 'string')) {
      throw new InvalidEntityDataError(ERROR_MESSAGES.ROLES_INVALID);
    }
    return value as string[];
  }
}
