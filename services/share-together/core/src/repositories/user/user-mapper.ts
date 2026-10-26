import {
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { User } from '../../types/index.js';

/** ユーザーの識別に使うビジネスキー */
export interface UserKey {
  userId: string;
}

/** ユーザーアイテムの SK。ユーザーは 1 件のメタ情報アイテムだけを持つ */
export const USER_META_SK = '#META#';

/** メールアドレスの GSI を引く GSI2 のインデックス名 */
export const USER_EMAIL_INDEX_NAME = 'GSI2';

/**
 * ユーザー ID からユーザーアイテムの PK を構築する
 *
 * @param userId - ユーザー ID
 */
export function buildUserPk(userId: string): string {
  return `USER#${userId}`;
}

/**
 * メールアドレスからユーザーアイテムの GSI2PK を構築する
 *
 * メールアドレスの大文字小文字は同一視されるため、キーは小文字に正規化する。
 * 入力の表記ゆれ (Foo@Example.com 等) でも同じユーザーを引けるようにするためで、
 * 保存する Email 属性は元の表記のまま残す。
 *
 * @param email - メールアドレス
 */
export function buildUserEmailGsi2Pk(email: string): string {
  return `EMAIL#${email.toLowerCase()}`;
}

/**
 * User Mapper
 *
 * User と DynamoDB Item の相互変換を担当する。
 * 保存は PascalCase の属性名と数値ミリ秒の時刻で行い、読み取りは旧形式
 * (camelCase の属性名と ISO 文字列の時刻) も受け付ける。
 */
export class UserMapper implements EntityMapper<User, UserKey> {
  public readonly entityType = 'User';

  // 旧形式のデータは書き込まれるまで残るため、更新時に旧名を消して二重に残さない
  public readonly legacyAttributeNames = {
    UserID: ['userId'],
    Email: ['email'],
    Name: ['name'],
    Image: ['image'],
    DefaultListID: ['defaultListId'],
    CreatedAt: ['createdAt'],
    UpdatedAt: ['updatedAt'],
  } as const;

  public buildKeys(key: UserKey): DynamoDBKey {
    return {
      PK: buildUserPk(key.userId),
      SK: USER_META_SK,
    };
  }

  public getKey(entity: User): UserKey {
    return { userId: entity.userId };
  }

  public toItem(entity: User): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      GSI2PK: buildUserEmailGsi2Pk(entity.email),
      UserID: entity.userId,
      Email: entity.email,
      Name: entity.name,
      // DocumentClient は undefined を含む Item を拒否するため、画像がないときは属性ごと省く
      ...(entity.image !== undefined ? { Image: entity.image } : {}),
      DefaultListID: entity.defaultListId,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換する
   *
   * userId は PK に、createdAt は作成時の値として固定されるため、含めると拒否する。
   * GSI2PK は email から作られるため、email を変えるときだけ付け直す。
   *
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<User>): DynamoDBAttributes {
    const email = requiredPatchValue(changes.email, 'Email');
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Email: email,
      GSI2PK: email === undefined ? undefined : buildUserEmailGsi2Pk(email),
      Name: requiredPatchValue(changes.name, 'Name'),
      Image: optionalPatchValue(changes.image),
      DefaultListID: requiredPatchValue(changes.defaultListId, 'DefaultListID'),
    };
  }

  public toEntity(item: DynamoDBAttributes): User {
    const legacy = this.legacyAttributeNames;
    const image = readAttribute(item, 'Image', legacy.Image);

    return {
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      email: validateStringField(readAttribute(item, 'Email', legacy.Email), 'Email'),
      name: validateStringField(readAttribute(item, 'Name', legacy.Name), 'Name', {
        allowEmpty: true,
      }),
      image:
        image === undefined ? undefined : validateStringField(image, 'Image', { allowEmpty: true }),
      defaultListId: validateStringField(
        readAttribute(item, 'DefaultListID', legacy.DefaultListID),
        'DefaultListID'
      ),
      createdAt: readTimestamp(item, 'CreatedAt', legacy.CreatedAt),
      updatedAt: readTimestamp(item, 'UpdatedAt', legacy.UpdatedAt),
    };
  }
}
