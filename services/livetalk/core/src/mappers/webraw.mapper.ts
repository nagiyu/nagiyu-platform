import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { WebRawEntity, WebRawKey, WebRawOrigin } from '../entities/webraw.entity.js';
import { buildUserPK, buildWebRawSK } from './keys.js';

/**
 * `WebRawEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 * Entity は更新日時を持たないため、`UpdatedAt` は store が書く値だけを保存する。
 */
export class WebRawMapper implements EntityMapper<WebRawEntity, WebRawKey> {
  public readonly entityType = 'WebRaw';

  public buildKeys(key: WebRawKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildWebRawSK(key.characterId, key.rawId),
    };
  }

  public getKey(entity: WebRawEntity): WebRawKey {
    return { userId: entity.userId, characterId: entity.characterId, rawId: entity.rawId };
  }

  public toItem(entity: WebRawEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      RawID: entity.rawId,
      Query: entity.query,
      RawText: entity.rawText,
      SourceUrls: entity.sourceUrls,
      Origin: entity.origin,
      CreatedAt: entity.createdAt,
      ...(entity.requestText !== undefined && { RequestText: entity.requestText }),
      ...(entity.requestedAt !== undefined && { RequestedAt: entity.requestedAt }),
      ...(entity.expiresAt !== undefined && {
        [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
      }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<WebRawEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      RawID: immutablePatchValue(changes.rawId, 'RawID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Query: requiredPatchValue(changes.query, 'Query'),
      RawText: requiredPatchValue(changes.rawText, 'RawText'),
      SourceUrls: requiredPatchValue(changes.sourceUrls, 'SourceUrls'),
      Origin: requiredPatchValue(changes.origin, 'Origin'),
      RequestText: optionalPatchValue(changes.requestText),
      RequestedAt: optionalPatchValue(changes.requestedAt),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): WebRawEntity {
    // Origin を持たない旧データは自発リサーチ由来として扱う
    const origin: WebRawOrigin =
      item.Origin !== undefined
        ? (validateStringField(item.Origin, 'Origin') as WebRawOrigin)
        : 'auto';
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME);

    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      rawId: validateStringField(item.RawID, 'RawID'),
      query: validateStringField(item.Query, 'Query'),
      rawText: validateStringField(item.RawText, 'RawText', { allowEmpty: true }),
      sourceUrls: Array.isArray(item.SourceUrls) ? (item.SourceUrls as string[]) : [],
      origin,
      createdAt: readTimestamp(item, 'CreatedAt'),
      ...(item.RequestText !== undefined && {
        requestText: validateStringField(item.RequestText, 'RequestText'),
      }),
      ...(item.RequestedAt !== undefined && {
        requestedAt: validateNumberField(item.RequestedAt, 'RequestedAt'),
      }),
      ...(expiresAt !== undefined && { expiresAt }),
    };
  }
}
