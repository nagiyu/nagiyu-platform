/**
 * NiconicoMylistAssistant Core - Video Mapper
 *
 * VideoEntity ↔ DynamoDBItem の変換を担当
 */

import { validateStringField } from '@nagiyu/aws';
import type { VideoEntity, VideoKey } from '../entities/video.entity';

/**
 * DynamoDB Item (現在のスキーマに合わせた型定義)
 */
interface VideoDynamoDBItem {
  PK: string;
  SK: string;
  entityType: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  length: string;
  createdAt: string;
  videoUpdatedAt?: string;
}

/**
 * Video Mapper
 *
 * VideoEntity と DynamoDB Item 間の変換を行う
 */
export class VideoMapper {
  private readonly entityType = 'VIDEO';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Video Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: VideoEntity): VideoDynamoDBItem {
    const { pk, sk } = this.buildKeys({
      videoId: entity.videoId,
    });

    const item: VideoDynamoDBItem = {
      PK: pk,
      SK: sk,
      entityType: this.entityType,
      videoId: entity.videoId,
      title: entity.title,
      thumbnailUrl: entity.thumbnailUrl,
      length: entity.length,
      createdAt: entity.createdAt,
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
  public toEntity(item: VideoDynamoDBItem): VideoEntity {
    const entity: VideoEntity = {
      videoId: validateStringField(item.videoId, 'videoId'),
      title: validateStringField(item.title, 'title'),
      thumbnailUrl: validateStringField(item.thumbnailUrl, 'thumbnailUrl'),
      length: validateStringField(item.length, 'length'),
      createdAt: validateStringField(item.createdAt, 'createdAt'),
    };

    if (item.videoUpdatedAt !== undefined) {
      entity.videoUpdatedAt = validateStringField(item.videoUpdatedAt, 'videoUpdatedAt');
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
