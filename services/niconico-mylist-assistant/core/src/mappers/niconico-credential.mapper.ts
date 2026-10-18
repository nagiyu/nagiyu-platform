/**
 * NiconicoMylistAssistant Core - NiconicoCredential Mapper
 *
 * NiconicoCredentialEntity ↔ DynamoDB Item の変換を担当
 */

import {
  immutablePatchValue,
  readAttribute,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  NiconicoCredentialEntity,
  NiconicoCredentialKey,
} from '../entities/niconico-credential.entity.js';
import { NICONICO_CREDENTIAL_SK } from '../entities/niconico-credential.entity.js';

/**
 * NiconicoCredential Mapper
 *
 * NiconicoCredentialEntity と DynamoDB Item 間の変換を行う。
 * 保存する属性名は PascalCase (頭字語は大文字のまま) で、旧データの camelCase の属性名も読める。
 */
export class NiconicoCredentialMapper implements EntityMapper<
  NiconicoCredentialEntity,
  NiconicoCredentialKey
> {
  public readonly entityType = 'NICONICO_CREDENTIAL';

  public readonly legacyAttributeNames = {
    UserID: ['userId'],
    EncryptedUserSession: ['encryptedUserSession'],
    AcquiredAt: ['acquiredAt'],
    EstimatedExpiresAt: ['estimatedExpiresAt'],
  } as const;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - NiconicoCredential Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: NiconicoCredentialKey): DynamoDBKey {
    return {
      PK: `USER#${key.userId}`,
      SK: NICONICO_CREDENTIAL_SK,
    };
  }

  public getKey(entity: NiconicoCredentialEntity): NiconicoCredentialKey {
    return { userId: entity.userId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * エンティティに作成日時がないため、CreatedAt にはセッション取得日時を充てる。
   * UpdatedAt は store が書き込み時に設定する。
   *
   * @param entity - NiconicoCredential Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: NiconicoCredentialEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      CreatedAt: entity.acquiredAt,
      UserID: entity.userId,
      EncryptedUserSession: entity.encryptedUserSession,
      AcquiredAt: entity.acquiredAt,
      EstimatedExpiresAt: entity.estimatedExpiresAt,
    };
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * userId は作成後に変えられないため、含めると拒否する。他の項目はすべて必須で、null は拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<NiconicoCredentialEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      EncryptedUserSession: requiredPatchValue(
        changes.encryptedUserSession,
        'EncryptedUserSession'
      ),
      AcquiredAt: requiredPatchValue(changes.acquiredAt, 'AcquiredAt'),
      EstimatedExpiresAt: requiredPatchValue(changes.estimatedExpiresAt, 'EstimatedExpiresAt'),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 新しい属性名を優先し、なければ旧名を読む。
   *
   * @param item - DynamoDB Item
   * @returns NiconicoCredential Entity
   */
  public toEntity(item: DynamoDBAttributes): NiconicoCredentialEntity {
    const legacy = this.legacyAttributeNames;
    return {
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      encryptedUserSession: validateStringField(
        readAttribute(item, 'EncryptedUserSession', legacy.EncryptedUserSession),
        'EncryptedUserSession'
      ),
      acquiredAt: readTimestamp(item, 'AcquiredAt', legacy.AcquiredAt),
      estimatedExpiresAt: readTimestamp(item, 'EstimatedExpiresAt', legacy.EstimatedExpiresAt),
    };
  }
}
