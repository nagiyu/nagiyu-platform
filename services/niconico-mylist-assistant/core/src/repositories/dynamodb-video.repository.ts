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
  ScanCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { EntityAlreadyExistsError, DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type { VideoRepository } from './video.repository.interface.js';
import type { VideoEntity, CreateVideoInput } from '../entities/video.entity.js';
import { VideoMapper } from '../mappers/video.mapper.js';

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
   * 全動画を取得
   */
  public async listAll(): Promise<VideoEntity[]> {
    try {
      const items: DynamoDBItem[] = [];
      let exclusiveStartKey: DynamoDBItem | undefined;

      do {
        const result = await this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'begins_with(PK, :videoPrefix) AND begins_with(SK, :videoPrefix)',
            ExpressionAttributeValues: {
              ':videoPrefix': 'VIDEO#',
            },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        if (result.Items) {
          items.push(...(result.Items as DynamoDBItem[]));
        }
        exclusiveStartKey = result.LastEvaluatedKey as DynamoDBItem | undefined;
      } while (exclusiveStartKey);

      return items.map((item) => this.mapper.toEntity(item));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
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

      return this.mapper.toEntity(result.Item as DynamoDBItem);
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

    try {
      const items: DynamoDBItem[] = [];
      for (let i = 0; i < videoIds.length; i += 100) {
        const chunk = videoIds.slice(i, i + 100);
        const result = await this.docClient.send(
          new BatchGetCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: chunk.map((videoId) => {
                  const { pk, sk } = this.mapper.buildKeys({ videoId });
                  return { PK: pk, SK: sk };
                }),
              },
            },
          })
        );

        const responseItems = result.Responses?.[this.tableName] as DynamoDBItem[] | undefined;
        items.push(...(responseItems ?? []));
      }
      return items.map((item) => this.mapper.toEntity(item as DynamoDBItem));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 新しい動画を作成
   */
  public async create(input: CreateVideoInput): Promise<VideoEntity> {
    const now = Date.now();
    const entity: VideoEntity = {
      ...input,
      CreatedAt: now,
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
