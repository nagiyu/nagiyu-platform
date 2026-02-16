/**
 * DynamoDB BatchJob Repository のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBBatchJobRepository } from '../../../src/repositories/dynamodb-batch-job.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import type { CreateBatchJobInput, UpdateBatchJobInput } from '../../../src/entities/batch-job.entity.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBBatchJobRepository', () => {
  let repository: DynamoDBBatchJobRepository;
  const tableName = 'test-table';

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBBatchJobRepository(docClient, tableName);
  });

  describe('getById', () => {
    it('存在するバッチジョブを取得できる', async () => {
      const mockItem = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.getById('job-123', 'user-456');

      expect(result).not.toBeNull();
      expect(result?.jobId).toBe('job-123');
      expect(result?.userId).toBe('user-456');
      expect(result?.status).toBe('SUBMITTED');
    });

    it('存在しないバッチジョブはnullを返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getById('non-existent', 'user-456');

      expect(result).toBeNull();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getById('job-123', 'user-456')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('新しいバッチジョブを作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      const result = await repository.create(input);

      expect(result.jobId).toBe(input.jobId);
      expect(result.userId).toBe(input.userId);
      expect(result.status).toBe(input.status);
      expect(result.CreatedAt).toBeGreaterThan(0);
      expect(result.UpdatedAt).toBeGreaterThan(0);
    });

    it('同じジョブIDで重複作成するとEntityAlreadyExistsErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('バッチジョブのステータスを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'PROCESSING',
        CreatedAt: 1234567890000,
        UpdatedAt: Date.now(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const input: UpdateBatchJobInput = {
        status: 'PROCESSING',
      };

      const result = await repository.update('job-123', 'user-456', input);

      expect(result.status).toBe('PROCESSING');
      expect(result.jobId).toBe('job-123');
      expect(result.userId).toBe('user-456');
    });

    it('存在しないバッチジョブを更新するとEntityNotFoundErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const input: UpdateBatchJobInput = {
        status: 'PROCESSING',
      };

      await expect(repository.update('non-existent', 'user-456', input)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('UpdateCommandでAttributesが返されない場合はEntityNotFoundErrorをスローする', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const input: UpdateBatchJobInput = {
        status: 'PROCESSING',
      };

      await expect(repository.update('job-123', 'user-456', input)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

      const input: UpdateBatchJobInput = {
        status: 'PROCESSING',
      };

      await expect(repository.update('job-123', 'user-456', input)).rejects.toThrow(DatabaseError);
    });

    it('resultフィールドを更新できる', async () => {
      const mockUpdatedItem = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        result: 'SUCCESS',
        CreatedAt: 1234567890000,
        UpdatedAt: Date.now(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const input: UpdateBatchJobInput = {
        status: 'COMPLETED',
        result: 'SUCCESS',
      };

      const result = await repository.update('job-123', 'user-456', input);

      expect(result.status).toBe('COMPLETED');
      expect(result.result).toBe('SUCCESS');
    });

    it('CompletedAtフィールドを更新できる', async () => {
      const completedAt = Date.now();
      const mockUpdatedItem = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        CompletedAt: completedAt,
        CreatedAt: 1234567890000,
        UpdatedAt: Date.now(),
      };

      ddbMock.on(UpdateCommand).resolves({
        Attributes: mockUpdatedItem,
      });

      const input: UpdateBatchJobInput = {
        status: 'COMPLETED',
        CompletedAt: completedAt,
      };

      const result = await repository.update('job-123', 'user-456', input);

      expect(result.CompletedAt).toBe(completedAt);
    });
  });

  describe('delete', () => {
    it('バッチジョブを削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('job-123', 'user-456')).resolves.not.toThrow();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('job-123', 'user-456')).rejects.toThrow(DatabaseError);
    });
  });
});
