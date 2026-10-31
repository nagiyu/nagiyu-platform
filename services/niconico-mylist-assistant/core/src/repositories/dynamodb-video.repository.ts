/**
 * NiconicoMylistAssistant Core - DynamoDB Video Repository
 *
 * DynamoDBを使用したVideoRepositoryの実装
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  batchGetAll,
  toDatabaseError,
  scanAllItems,
  type EntityStore,
} from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { VideoEntity, VideoKey, CreateVideoInput } from '../entities/video.entity.js';
import { VideoMapper } from '../mappers/video.mapper.js';

/**
 * DynamoDB Video Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、Scan と BatchGet だけを自前で持つ
 */
export class DynamoDBVideoRepository implements VideoRepository {
  private readonly mapper = new VideoMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<VideoEntity, VideoKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  /**
   * 全動画を取得
   */
  public async listAll(): Promise<VideoEntity[]> {
    try {
      const items = await scanAllItems(this.docClient, {
        TableName: this.tableName,
        FilterExpression: 'begins_with(PK, :videoPrefix) AND begins_with(SK, :videoPrefix)',
        ExpressionAttributeValues: {
          ':videoPrefix': 'VIDEO#',
        },
      });

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 動画IDで単一の動画を取得
   */
  public async getById(videoId: string): Promise<VideoEntity | null> {
    return this.entityStore.get({ videoId });
  }

  /**
   * 複数の動画を一括取得
   */
  public async batchGet(videoIds: string[]): Promise<VideoEntity[]> {
    if (videoIds.length === 0) {
      return [];
    }

    try {
      const items = await batchGetAll(
        this.docClient,
        this.tableName,
        videoIds.map((videoId) => this.mapper.buildKeys({ videoId }))
      );
      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  /**
   * 新しい動画を作成
   */
  public async create(input: CreateVideoInput): Promise<VideoEntity> {
    return this.entityStore.create(input);
  }

  /**
   * 動画を削除
   */
  public async delete(videoId: string): Promise<void> {
    await this.entityStore.delete({ videoId });
  }

  /**
   * 動画を削除する。対象がなくても成功する
   */
  public async deleteIfExists(videoId: string): Promise<void> {
    await this.entityStore.deleteIfExists({ videoId });
  }
}
