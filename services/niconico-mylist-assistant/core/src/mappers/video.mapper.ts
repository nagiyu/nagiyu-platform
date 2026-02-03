/**
 * NiconicoMylistAssistant Core - Video Mapper
 *
 * VideoEntity ↔ DynamoDBItem の変換を担当
 */

import { validateStringField } from '@nagiyu/aws';
import type { VideoEntity, VideoKey } from '../entities/video.entity';

/**
 * DynamoDB Item 型 (niconico-mylist-assistant スキーマ)
 *
 * Note: プラットフォーム標準の DynamoDBItem は CreatedAt/UpdatedAt を Unix timestamp で定義しているが、
 * 本サービスは ISO 8601 文字列を使用しているため、カスタム型を使用
 */
interface VideoDynamoDBItem extends Record<string, unknown> {
  PK: string;
  SK: string;
  Type: string;
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
 *
 * Note: EntityMapper<TEntity, TKey> インターフェースの実装は見送り
 * 理由: プラットフォーム標準の EntityMapper は CreatedAt/UpdatedAt を Unix timestamp で要求するが、
 * 本サービスは ISO 8601 文字列を使用しているため、型の互換性がない
 */
export class VideoMapper {
  private readonly entityType = 'VIDEO';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - Video Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: VideoEntity): Record<string, unknown> {
    const { pk, sk } = this.buildKeys({
      videoId: entity.videoId,
    });

    const item: VideoDynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
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
  public toEntity(item: Record<string, unknown>): VideoEntity {
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
