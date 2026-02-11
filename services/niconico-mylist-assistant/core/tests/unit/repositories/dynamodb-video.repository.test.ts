/**
 * DynamoDB Video Repository のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBVideoRepository } from '../../../src/repositories/dynamodb-video.repository.js';
import { EntityAlreadyExistsError, DatabaseError } from '@nagiyu/aws';
import type { CreateVideoInput } from '../../../src/entities/video.entity.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBVideoRepository', () => {
  let repository: DynamoDBVideoRepository;
  const tableName = 'test-table';

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBVideoRepository(docClient, tableName);
  });

  describe('getById', () => {
    it('存在する動画を取得できる', async () => {
      const mockItem = {
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        Type: 'VIDEO',
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.getById('sm12345');

      expect(result).not.toBeNull();
      expect(result?.videoId).toBe('sm12345');
      expect(result?.title).toBe('Test Video');
      expect(result?.length).toBe('5:00');
    });

    it('存在しない動画はnullを返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getById('sm99999');

      expect(result).toBeNull();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getById('sm12345')).rejects.toThrow(DatabaseError);
    });
  });

  describe('batchGet', () => {
    it('複数の動画を一括取得できる', async () => {
      const mockItems = [
        {
          PK: 'VIDEO#sm12345',
          SK: 'VIDEO#sm12345',
          Type: 'VIDEO',
          videoId: 'sm12345',
          title: 'Video 1',
          thumbnailUrl: 'https://example.com/thumb1.jpg',
          length: '5:00',
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'VIDEO#sm67890',
          SK: 'VIDEO#sm67890',
          Type: 'VIDEO',
          videoId: 'sm67890',
          title: 'Video 2',
          thumbnailUrl: 'https://example.com/thumb2.jpg',
          length: '3:20',
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      ];

      ddbMock.on(BatchGetCommand).resolves({
        Responses: {
          [tableName]: mockItems,
        },
      });

      const result = await repository.batchGet(['sm12345', 'sm67890']);

      expect(result).toHaveLength(2);
      expect(result[0].videoId).toBe('sm12345');
      expect(result[1].videoId).toBe('sm67890');
    });

    it('空の配列を渡すと空の配列を返す', async () => {
      const result = await repository.batchGet([]);

      expect(result).toEqual([]);
    });

    it('100件を超える場合はエラーをスローする', async () => {
      const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i}`);

      await expect(repository.batchGet(videoIds)).rejects.toThrow(
        'batchGet: 最大100件まで取得可能です'
      );
    });

    it('Responsesがundefinedの場合は空配列を返す', async () => {
      ddbMock.on(BatchGetCommand).resolves({});

      const result = await repository.batchGet(['sm12345']);

      expect(result).toEqual([]);
    });

    it('指定したテーブルのResponsesがない場合は空配列を返す', async () => {
      ddbMock.on(BatchGetCommand).resolves({
        Responses: {},
      });

      const result = await repository.batchGet(['sm12345']);

      expect(result).toEqual([]);
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(BatchGetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.batchGet(['sm12345'])).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('新しい動画を作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      const result = await repository.create(input);

      expect(result.videoId).toBe(input.videoId);
      expect(result.title).toBe(input.title);
      expect(result.length).toBe(input.length);
      expect(result.CreatedAt).toBeGreaterThan(0);
    });

    it('同じvideoIdで重複作成するとEntityAlreadyExistsErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const input: CreateVideoInput = {
        videoId: 'sm12345',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '5:00',
      };

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('delete', () => {
    it('動画を削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('sm12345')).resolves.not.toThrow();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('sm12345')).rejects.toThrow(DatabaseError);
    });
  });
});
