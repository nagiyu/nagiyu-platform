// テスト実行前にTABLE_NAMEを設定
process.env.TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createVideo, getVideo, updateVideoSettings, deleteVideo, listVideos } from '../../src/db/videos';
import type { Video, VideoSettings } from '../../src/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('videos', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('createVideo', () => {
    it('動画を新規作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const video: Video = {
        videoId: 'sm12345678',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        isFavorite: false,
        isSkip: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      await createVideo('user123', video);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'test-table',
        Item: {
          PK: 'USER#user123',
          SK: 'VIDEO#sm12345678',
          GSI1PK: 'VIDEO#sm12345678',
          GSI1SK: 'USER#user123',
          videoId: 'sm12345678',
          title: 'テスト動画',
        },
      });
    });
  });

  describe('getVideo', () => {
    it('動画を取得できる', async () => {
      const mockItem = {
        PK: 'USER#user123',
        SK: 'VIDEO#sm12345678',
        GSI1PK: 'VIDEO#sm12345678',
        GSI1SK: 'USER#user123',
        videoId: 'sm12345678',
        title: 'テスト動画',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        isFavorite: false,
        isSkip: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const video = await getVideo('user123', 'sm12345678');

      expect(video).not.toBeNull();
      expect(video?.videoId).toBe('sm12345678');
      expect(video?.title).toBe('テスト動画');
      expect(video).not.toHaveProperty('PK');
      expect(video).not.toHaveProperty('SK');
    });

    it('存在しない動画はnullを返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const video = await getVideo('user123', 'sm99999999');

      expect(video).toBeNull();
    });
  });

  describe('updateVideoSettings', () => {
    it('お気に入りを更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const settings: VideoSettings = {
        isFavorite: true,
      };

      await updateVideoSettings('user123', 'sm12345678', settings);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.UpdateExpression).toContain('#isFavorite = :isFavorite');
      expect(call.args[0].input.UpdateExpression).toContain('#updatedAt = :updatedAt');
    });

    it('複数の設定を同時に更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({});

      const settings: VideoSettings = {
        isFavorite: true,
        isSkip: true,
        memo: 'テストメモ',
      };

      await updateVideoSettings('user123', 'sm12345678', settings);

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.UpdateExpression).toContain('#isFavorite = :isFavorite');
      expect(call.args[0].input.UpdateExpression).toContain('#isSkip = :isSkip');
      expect(call.args[0].input.UpdateExpression).toContain('#memo = :memo');
    });
  });

  describe('deleteVideo', () => {
    it('動画を削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await deleteVideo('user123', 'sm12345678');

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input).toMatchObject({
        TableName: 'test-table',
        Key: {
          PK: 'USER#user123',
          SK: 'VIDEO#sm12345678',
        },
      });
    });
  });

  describe('listVideos', () => {
    it('ユーザーの動画一覧を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user123',
          SK: 'VIDEO#sm1',
          GSI1PK: 'VIDEO#sm1',
          GSI1SK: 'USER#user123',
          videoId: 'sm1',
          title: '動画1',
          thumbnailUrl: 'https://example.com/1.jpg',
          isFavorite: true,
          isSkip: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          PK: 'USER#user123',
          SK: 'VIDEO#sm2',
          GSI1PK: 'VIDEO#sm2',
          GSI1SK: 'USER#user123',
          videoId: 'sm2',
          title: '動画2',
          thumbnailUrl: 'https://example.com/2.jpg',
          isFavorite: false,
          isSkip: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({ Items: mockItems });

      const result = await listVideos('user123');

      expect(result.videos).toHaveLength(2);
      expect(result.videos[0].videoId).toBe('sm1');
      expect(result.videos[1].videoId).toBe('sm2');
      expect(result.videos[0]).not.toHaveProperty('PK');
    });

    it('お気に入りでフィルタリングできる', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await listVideos('user123', { filter: 'favorite' });

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.FilterExpression).toBe('isFavorite = :true');
    });

    it('スキップでフィルタリングできる', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      await listVideos('user123', { filter: 'skip' });

      expect(ddbMock.calls()).toHaveLength(1);
      const call = ddbMock.call(0);
      expect(call.args[0].input.FilterExpression).toBe('isSkip = :true');
    });

    it('ページネーションに対応している', async () => {
      const lastKey = { PK: 'USER#user123', SK: 'VIDEO#sm100' };
      ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });

      const result = await listVideos('user123', { limit: 50 });

      expect(result.lastEvaluatedKey).toEqual(lastKey);
      const call = ddbMock.call(0);
      expect(call.args[0].input.Limit).toBe(50);
    });
  });
});
