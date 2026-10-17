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
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBVideoRepository } from '../../../src/repositories/dynamodb-video.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
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
        VideoID: 'sm12345',
        Title: 'Test Video',
        ThumbnailURL: 'https://example.com/thumb.jpg',
        Length: '5:00',
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

    it('旧属性名 (camelCase) のアイテムも取得できる', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'VIDEO#sm12345',
          SK: 'VIDEO#sm12345',
          Type: 'VIDEO',
          videoId: 'sm12345',
          title: 'Legacy Video',
          thumbnailUrl: 'https://example.com/legacy.jpg',
          length: '1:00',
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      });

      const result = await repository.getById('sm12345');

      expect(result).toEqual({
        videoId: 'sm12345',
        title: 'Legacy Video',
        thumbnailUrl: 'https://example.com/legacy.jpg',
        length: '1:00',
        createdAt: 1234567890000,
      });
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

  describe('listAll', () => {
    it('全動画を取得できる', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [
          {
            PK: 'VIDEO#sm12345',
            SK: 'VIDEO#sm12345',
            Type: 'VIDEO',
            VideoID: 'sm12345',
            Title: 'Video 1',
            ThumbnailURL: 'https://example.com/thumb1.jpg',
            Length: '5:00',
            CreatedAt: 1234567890000,
            UpdatedAt: 1234567890000,
          },
        ],
      });

      const result = await repository.listAll();

      expect(result).toHaveLength(1);
      expect(result[0].videoId).toBe('sm12345');
    });

    it('複数ページにわたる Scan で全件取得し、前ページの LastEvaluatedKey を引き継ぐ', async () => {
      const buildItem = (videoId: string) => ({
        PK: `VIDEO#${videoId}`,
        SK: `VIDEO#${videoId}`,
        Type: 'VIDEO',
        VideoID: videoId,
        Title: `Title ${videoId}`,
        ThumbnailURL: `https://example.com/${videoId}.jpg`,
        Length: '5:00',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      });
      const lastEvaluatedKey = { PK: 'VIDEO#sm1', SK: 'VIDEO#sm1' };
      ddbMock
        .on(ScanCommand)
        .resolvesOnce({ Items: [buildItem('sm1')], LastEvaluatedKey: lastEvaluatedKey })
        .resolvesOnce({ Items: [buildItem('sm2')] });

      const result = await repository.listAll();

      expect(result.map((v) => v.videoId)).toEqual(['sm1', 'sm2']);
      const calls = ddbMock.commandCalls(ScanCommand);
      expect(calls).toHaveLength(2);
      expect(calls[0].args[0].input.ExclusiveStartKey).toBeUndefined();
      expect(calls[1].args[0].input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });
  });

  describe('batchGet', () => {
    it('複数の動画を一括取得できる', async () => {
      const mockItems = [
        {
          PK: 'VIDEO#sm12345',
          SK: 'VIDEO#sm12345',
          Type: 'VIDEO',
          VideoID: 'sm12345',
          Title: 'Video 1',
          ThumbnailURL: 'https://example.com/thumb1.jpg',
          Length: '5:00',
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'VIDEO#sm67890',
          SK: 'VIDEO#sm67890',
          Type: 'VIDEO',
          VideoID: 'sm67890',
          Title: 'Video 2',
          ThumbnailURL: 'https://example.com/thumb2.jpg',
          Length: '3:20',
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

    it('100件を超える場合は分割して取得できる', async () => {
      const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i}`);
      ddbMock
        .on(BatchGetCommand)
        .resolvesOnce({
          Responses: {
            [tableName]: [
              {
                PK: 'VIDEO#sm0',
                SK: 'VIDEO#sm0',
                Type: 'VIDEO',
                VideoID: 'sm0',
                Title: 'Video 0',
                ThumbnailURL: 'https://example.com/thumb0.jpg',
                Length: '5:00',
                CreatedAt: 1234567890000,
                UpdatedAt: 1234567890000,
              },
            ],
          },
        })
        .resolvesOnce({
          Responses: {
            [tableName]: [
              {
                PK: 'VIDEO#sm100',
                SK: 'VIDEO#sm100',
                Type: 'VIDEO',
                VideoID: 'sm100',
                Title: 'Video 100',
                ThumbnailURL: 'https://example.com/thumb100.jpg',
                Length: '5:00',
                CreatedAt: 1234567890000,
                UpdatedAt: 1234567890000,
              },
            ],
          },
        });

      const result = await repository.batchGet(videoIds);
      expect(result).toHaveLength(2);
      expect(result.map((video) => video.videoId)).toEqual(['sm0', 'sm100']);
      expect(ddbMock.commandCalls(BatchGetCommand)).toHaveLength(2);
    });

    it('未処理キーを再送して取得できる', async () => {
      const buildItem = (videoId: string) => ({
        PK: `VIDEO#${videoId}`,
        SK: `VIDEO#${videoId}`,
        Type: 'VIDEO',
        VideoID: videoId,
        Title: videoId,
        ThumbnailURL: 'https://example.com/thumb.jpg',
        Length: '5:00',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      });
      ddbMock
        .on(BatchGetCommand)
        .resolvesOnce({
          Responses: { [tableName]: [buildItem('sm1')] },
          UnprocessedKeys: { [tableName]: { Keys: [{ PK: 'VIDEO#sm2', SK: 'VIDEO#sm2' }] } },
        })
        .resolvesOnce({ Responses: { [tableName]: [buildItem('sm2')] } });

      const result = await repository.batchGet(['sm1', 'sm2']);

      expect(result.map((video) => video.videoId)).toEqual(['sm1', 'sm2']);
      expect(ddbMock.commandCalls(BatchGetCommand)).toHaveLength(2);
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
      expect(result.createdAt).toBeGreaterThan(0);

      const putInput = ddbMock.commandCalls(PutCommand)[0].args[0].input;
      expect(putInput.Item).toEqual({
        PK: 'VIDEO#sm12345',
        SK: 'VIDEO#sm12345',
        Type: 'VIDEO',
        VideoID: 'sm12345',
        Title: 'Test Video',
        ThumbnailURL: 'https://example.com/thumb.jpg',
        Length: '5:00',
        CreatedAt: result.createdAt,
        UpdatedAt: expect.any(Number),
      });
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

    it('存在しない動画を削除するとEntityNotFoundErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(DeleteCommand).rejects(error);

      await expect(repository.delete('sm99999')).rejects.toThrow(EntityNotFoundError);
    });

    it('deleteIfExists は対象がなくても成功し、存在を条件にしない', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.deleteIfExists('sm99999')).resolves.toBeUndefined();

      const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'VIDEO#sm99999', SK: 'VIDEO#sm99999' });
      expect(input).not.toHaveProperty('ConditionExpression');
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('sm12345')).rejects.toThrow(DatabaseError);
    });
  });
});
