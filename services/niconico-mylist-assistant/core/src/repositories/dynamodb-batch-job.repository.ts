/**
 * NiconicoMylistAssistant Core - DynamoDB BatchJob Repository
 *
 * DynamoDBを使用したBatchJobRepositoryの実装
 */

import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  DatabaseError,
  type DynamoDBItem,
} from '@nagiyu/aws';
import type { BatchJobRepository } from './batch-job.repository.interface.js';
import type {
  BatchJobEntity,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity';
import { BatchJobMapper } from '../mappers/batch-job.mapper';

/**
 * DynamoDB BatchJob Repository
 *
 * DynamoDBを使用したバッチジョブリポジトリの実装
 */
export class DynamoDBBatchJobRepository implements BatchJobRepository {
  private readonly mapper: BatchJobMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.mapper = new BatchJobMapper();
  }

  /**
   * ジョブIDとユーザーIDで単一のバッチジョブを取得
   */
  public async getById(jobId: string, userId: string): Promise<BatchJobEntity | null> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ jobId, userId });

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
   * 新しいバッチジョブを作成
   */
  public async create(input: CreateBatchJobInput): Promise<BatchJobEntity> {
    const now = Date.now();
    const entity: BatchJobEntity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );

      return entity;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityAlreadyExistsError('BatchJob', `${input.jobId}#${input.userId}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * バッチジョブのステータスを更新
   */
  public async update(
    jobId: string,
    userId: string,
    input: UpdateBatchJobInput
  ): Promise<BatchJobEntity> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ jobId, userId });
      const attributes = this.mapper.buildUpdateAttributes(input);

      // UpdateExpression と ExpressionAttributeValues を構築
      const updateExpressionParts: string[] = [];
      const expressionAttributeValues: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(attributes)) {
        updateExpressionParts.push(`${key} = :${key}`);
        expressionAttributeValues[`:${key}`] = value;
      }

      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
          ExpressionAttributeValues: expressionAttributeValues,
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ReturnValues: 'ALL_NEW',
        })
      );

      if (!result.Attributes) {
        throw new EntityNotFoundError('BatchJob', `${jobId}#${userId}`);
      }

      return this.mapper.toEntity(result.Attributes as DynamoDBItem);
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new EntityNotFoundError('BatchJob', `${jobId}#${userId}`);
      }

      if (error instanceof EntityNotFoundError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  /**
   * バッチジョブを削除
   */
  public async delete(jobId: string, userId: string): Promise<void> {
    try {
      const { pk, sk } = this.mapper.buildKeys({ jobId, userId });

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
