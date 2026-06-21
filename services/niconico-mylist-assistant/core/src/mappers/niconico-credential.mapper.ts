/**
 * NiconicoMylistAssistant Core - NiconicoCredential Mapper
 *
 * NiconicoCredentialEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem, EntityMapper } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type {
  NiconicoCredentialEntity,
  NiconicoCredentialKey,
} from '../entities/niconico-credential.entity.js';
import { NICONICO_CREDENTIAL_SK } from '../entities/niconico-credential.entity.js';

/**
 * NiconicoCredential Mapper
 *
 * NiconicoCredentialEntity と DynamoDB Item 間の変換を行う
 */
export class NiconicoCredentialMapper implements EntityMapper<
  NiconicoCredentialEntity,
  NiconicoCredentialKey
> {
  private readonly entityType = 'NICONICO_CREDENTIAL';

  /**
   * Entity を DynamoDB Item に変換
   *
   * DynamoDBItem の必須フィールド（CreatedAt/UpdatedAt）には acquiredAt を充てる。
   * セッション資格情報はビジネス的な取得日時を acquiredAt で管理する。
   *
   * @param entity - NiconicoCredential Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: NiconicoCredentialEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({ userId: entity.userId });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      // DynamoDBItem の必須フィールド（インフラ層の型互換性維持）
      CreatedAt: entity.acquiredAt,
      UpdatedAt: entity.acquiredAt,
      // ビジネスフィールド
      userId: entity.userId,
      encryptedUserSession: entity.encryptedUserSession,
      acquiredAt: entity.acquiredAt,
      estimatedExpiresAt: entity.estimatedExpiresAt,
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns NiconicoCredential Entity
   */
  public toEntity(item: DynamoDBItem): NiconicoCredentialEntity {
    return {
      userId: validateStringField(item.userId, 'userId'),
      encryptedUserSession: validateStringField(item.encryptedUserSession, 'encryptedUserSession'),
      acquiredAt: validateTimestampField(item.acquiredAt, 'acquiredAt'),
      estimatedExpiresAt: validateTimestampField(item.estimatedExpiresAt, 'estimatedExpiresAt'),
    };
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - NiconicoCredential Key
   * @returns PK と SK
   */
  public buildKeys(key: NiconicoCredentialKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: NICONICO_CREDENTIAL_SK,
    };
  }
}
