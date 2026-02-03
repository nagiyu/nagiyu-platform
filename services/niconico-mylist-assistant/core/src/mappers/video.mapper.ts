/**
 * NiconicoMylistAssistant Core - Video Mapper
 *
 * VideoEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem, EntityMapper } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type { VideoEntity, VideoKey } from '../entities/video.entity';

/**
 * Video Mapper
 *
 * VideoEntity と DynamoDB Item 間の変換を行う
 */
export class VideoMapper implements EntityMapper<VideoEntity, VideoKey> {
  private readonly entityType = 'VIDEO';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Video Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: VideoEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      videoId: entity.videoId,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      videoId: entity.videoId,
      title: entity.title,
      thumbnailUrl: entity.thumbnailUrl,
      length: entity.length,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.CreatedAt, // Video には UpdatedAt がないため CreatedAt を使用
    };

    if (entity.videoUpdatedAt !== undefined) {
      item.videoUpdatedAt = entity.videoUpdatedAt;
    }

    return item;
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns Video Entity
   */
  public toEntity(item: DynamoDBItem): VideoEntity {
    const entity: VideoEntity = {
      videoId: validateStringField(item.videoId, 'videoId'),
      title: validateStringField(item.title, 'title'),
      thumbnailUrl: validateStringField(item.thumbnailUrl, 'thumbnailUrl'),
      length: validateStringField(item.length, 'length'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };

    if (item.videoUpdatedAt !== undefined) {
      entity.videoUpdatedAt = validateTimestampField(item.videoUpdatedAt, 'videoUpdatedAt');
    }

    return entity;
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - Video Key
   * @returns PK と SK
   */
  public buildKeys(key: VideoKey): { pk: string; sk: string } {
    return {
      pk: `VIDEO#${key.videoId}`,
      sk: `VIDEO#${key.videoId}`,
    };
  }
}
