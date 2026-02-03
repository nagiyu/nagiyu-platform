/**
 * NiconicoMylistAssistant Core - DynamoDB Video Repository
 *
 * DynamoDBを使用したVideoRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  BatchGetCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { EntityAlreadyExistsError, DatabaseError } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface';
import type { VideoEntity, CreateVideoInput } from '../entities/video.entity';
import { VideoMapper } from '../mappers/video.mapper';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  BATCH_GET_LIMIT: 'batchGet: 最大100件まで取得可能です',
} as const;

/**
 * DynamoDB Video Repository
 *
 * DynamoDBを使用した動画リポジトリの実装
 */
export class DynamoDBVideoRepository implements VideoRepository {
  private readonly mapper: VideoMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new VideoMapper();
  }

  /**
   * 動画IDで単一の動画を取得
   */
  public async getById(videoId: string): Promise<VideoEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ videoId });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );

      if (!result.Item) {
        return null;
      }

      return this.mapper.toEntity(result.Item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 複数の動画を一括取得
   */
  public async batchGet(videoIds: string[]): Promise<VideoEntity[]> {
    if (videoIds.length === 0) {
      return [];
    }

    if (videoIds.length > 100) {
      throw new Error(ERROR_MESSAGES.BATCH_GET_LIMIT);
    }

    try {
      const result = await this.docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: videoIds.map((videoId) => {
                const { pk, sk } = this.mapper.buildKeys({ videoId });
                return { PK: pk, SK: sk };
              }),
            },
          },
        })
      );

      const items = result.Responses?.[this.tableName] || [];
      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 新しい動画を作成
   */
  public async create(input: CreateVideoInput): Promise<VideoEntity> {
    const now = new Date().toISOString();
    const entity: VideoEntity = {
      ...input,
      createdAt: now,
    };

    try {
      const item = this.mapper.toItem(entity);

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      return entity;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError('Video', input.videoId);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 動画を削除
   */
  public async delete(videoId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ videoId });

      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
