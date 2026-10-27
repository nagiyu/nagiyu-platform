/**
 * NiconicoMylistAssistant Core - Video Mapper
 *
 * VideoEntity ↔ DynamoDB Item の変換を担当
 */

import {
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
import type { VideoEntity, VideoKey } from '../entities/video.entity.js';

/**
 * Video Mapper
 *
 * VideoEntity と DynamoDB Item 間の変換を行う。
 * 保存する属性名は PascalCase (頭字語は大文字のまま) で、旧データの camelCase の属性名も読める。
 */
export class VideoMapper implements EntityMapper<VideoEntity, VideoKey> {
  public readonly entityType = 'VIDEO';

  public readonly legacyAttributeNames = {
    VideoID: ['videoId'],
    Title: ['title'],
    ThumbnailURL: ['thumbnailUrl'],
    Length: ['length'],
    VideoUpdatedAt: ['videoUpdatedAt'],
  } as const;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Video Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: VideoKey): DynamoDBKey {
    return {
      PK: `VIDEO#${key.videoId}`,
      SK: `VIDEO#${key.videoId}`,
    };
  }

  public getKey(entity: VideoEntity): VideoKey {
    return { videoId: entity.videoId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * UpdatedAt は EntityStore が書き込み時に設定するため、ここでは含めない。
   *
   * @param entity - Video Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: VideoEntity): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      VideoID: entity.videoId,
      Title: entity.title,
      ThumbnailURL: entity.thumbnailUrl,
      Length: entity.length,
      CreatedAt: entity.createdAt,
    };

    if (entity.videoUpdatedAt !== undefined) {
      item.VideoUpdatedAt = entity.videoUpdatedAt;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * videoId・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<VideoEntity>): DynamoDBAttributes {
    return {
      VideoID: immutablePatchValue(changes.videoId, 'VideoID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Title: requiredPatchValue(changes.title, 'Title'),
      ThumbnailURL: requiredPatchValue(changes.thumbnailUrl, 'ThumbnailURL'),
      Length: requiredPatchValue(changes.length, 'Length'),
      VideoUpdatedAt: optionalPatchValue(changes.videoUpdatedAt),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 新しい属性名を優先し、なければ旧名を読む。
   *
   * @param item - DynamoDB Item
   * @returns Video Entity
   */
  public toEntity(item: DynamoDBAttributes): VideoEntity {
    const legacy = this.legacyAttributeNames;
    const entity: VideoEntity = {
      videoId: validateStringField(readAttribute(item, 'VideoID', legacy.VideoID), 'VideoID'),
      title: validateStringField(readAttribute(item, 'Title', legacy.Title), 'Title'),
      thumbnailUrl: validateStringField(
        readAttribute(item, 'ThumbnailURL', legacy.ThumbnailURL),
        'ThumbnailURL'
      ),
      length: validateStringField(readAttribute(item, 'Length', legacy.Length), 'Length'),
      createdAt: readTimestamp(item, 'CreatedAt'),
    };

    const videoUpdatedAt = readOptionalTimestamp(item, 'VideoUpdatedAt', legacy.VideoUpdatedAt);
    if (videoUpdatedAt !== undefined) {
      entity.videoUpdatedAt = videoUpdatedAt;
    }

    return entity;
  }
}
