// テスト実行前にTABLE_NAMEを設定
process.env.TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createVideoBasicInfo,
  getVideoBasicInfo,
  batchGetVideoBasicInfo,
  createUserVideoSetting,
  upsertUserVideoSetting,
  getUserVideoSetting,
  updateUserVideoSetting,
  listUserVideoSettings,
  deleteUserVideoSetting,
} from '../../src/db/videos';
import type {
  CreateVideoBasicInfoInput,
  CreateUserSettingInput,
  VideoSettingUpdate,
} from '../../src/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('videos', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('VIDEO エンティティ', () => {
    describe('createVideoBasicInfo', () => {
      it('動画基本情報を新規作成できる', async () => {
        ddbMock.on(PutCommand).resolves({});

        const input: CreateVideoBasicInfoInput = {
          videoId: 'sm12345678',
          title: 'テスト動画',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          length: '5:30',
        };

        const result = await createVideoBasicInfo(input);

        expect(result.videoId).toBe('sm12345678');
        expect(result.title).toBe('テスト動画');
        expect(result.createdAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'VIDEO#sm12345678',
            SK: 'VIDEO#sm12345678',
            entityType: 'VIDEO',
            videoId: 'sm12345678',
            title: 'テスト動画',
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        });
      });

      it('既に存在する動画を作成しようとするとエラーになる', async () => {
        const error = new Error('ConditionalCheckFailedException');
        error.name = 'ConditionalCheckFailedException';
        ddbMock.on(PutCommand).rejects(error);

        const input: CreateVideoBasicInfoInput = {
          videoId: 'sm12345678',
          title: 'テスト動画',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          length: '5:30',
        };

        await expect(createVideoBasicInfo(input)).rejects.toThrow(
          'ConditionalCheckFailedException'
        );
      });
    });

    describe('getVideoBasicInfo', () => {
      it('動画基本情報を取得できる', async () => {
        const mockItem = {
          PK: 'VIDEO#sm12345678',
          SK: 'VIDEO#sm12345678',
          entityType: 'VIDEO',
          videoId: 'sm12345678',
          title: 'テスト動画',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          length: '5:30',
          createdAt: '2024-01-01T00:00:00Z',
        };

        ddbMock.on(GetCommand).resolves({ Item: mockItem });

        const video = await getVideoBasicInfo('sm12345678');

        expect(video).not.toBeNull();
        expect(video?.videoId).toBe('sm12345678');
        expect(video?.title).toBe('テスト動画');
        expect(video).not.toHaveProperty('PK');
        expect(video).not.toHaveProperty('SK');
        expect(video).not.toHaveProperty('entityType');
      });

      it('存在しない動画はnullを返す', async () => {
        ddbMock.on(GetCommand).resolves({});

        const video = await getVideoBasicInfo('sm99999999');

        expect(video).toBeNull();
      });
    });

    describe('batchGetVideoBasicInfo', () => {
      it('複数の動画基本情報を一括取得できる', async () => {
        const mockItems = [
          {
            PK: 'VIDEO#sm1',
            SK: 'VIDEO#sm1',
            entityType: 'VIDEO',
            videoId: 'sm1',
            title: '動画1',
            thumbnailUrl: 'https://example.com/1.jpg',
            length: '3:00',
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            PK: 'VIDEO#sm2',
            SK: 'VIDEO#sm2',
            entityType: 'VIDEO',
            videoId: 'sm2',
            title: '動画2',
            thumbnailUrl: 'https://example.com/2.jpg',
            length: '4:00',
            createdAt: '2024-01-02T00:00:00Z',
          },
        ];

        ddbMock.on(BatchGetCommand).resolves({
          Responses: {
            'test-table': mockItems,
          },
        });

        const videos = await batchGetVideoBasicInfo(['sm1', 'sm2']);

        expect(videos).toHaveLength(2);
        expect(videos[0].videoId).toBe('sm1');
        expect(videos[1].videoId).toBe('sm2');
        expect(videos[0]).not.toHaveProperty('PK');
      });

      it('空の配列を渡すと空の配列を返す', async () => {
        const videos = await batchGetVideoBasicInfo([]);
        expect(videos).toEqual([]);
      });

      it('100件を超える場合はエラーを返す', async () => {
        const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i}`);
        await expect(batchGetVideoBasicInfo(videoIds)).rejects.toThrow(
          'batchGetVideoBasicInfo: 最大100件まで取得可能です'
        );
      });
    });
  });

  describe('USER_SETTING エンティティ', () => {
    describe('createUserVideoSetting', () => {
      it('新規ユーザー設定を作成できる', async () => {
        ddbMock.on(PutCommand).resolves({});

        const input: CreateUserSettingInput = {
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: false,
        };

        const result = await createUserVideoSetting(input);

        expect(result.userId).toBe('user123');
        expect(result.videoId).toBe('sm12345678');
        expect(result.isFavorite).toBe(true);
        expect(result.isSkip).toBe(false);
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: false,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        });
      });

      it('既に存在する設定を作成しようとするとエラーになる', async () => {
        const error = new Error('ConditionalCheckFailedException');
        error.name = 'ConditionalCheckFailedException';
        ddbMock.on(PutCommand).rejects(error);

        const input: CreateUserSettingInput = {
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: false,
        };

        await expect(createUserVideoSetting(input)).rejects.toThrow(
          'ConditionalCheckFailedException'
        );
      });
    });

    describe('upsertUserVideoSetting', () => {
      it('新規ユーザー設定を作成できる', async () => {
        ddbMock.on(GetCommand).resolves({}); // 既存レコードなし
        ddbMock.on(PutCommand).resolves({});

        const input: CreateUserSettingInput = {
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: false,
        };

        const result = await upsertUserVideoSetting(input);

        expect(result.userId).toBe('user123');
        expect(result.videoId).toBe('sm12345678');
        expect(result.isFavorite).toBe(true);
        expect(result.isSkip).toBe(false);
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(2); // Get + Put
        const putCall = ddbMock.calls()[1];
        expect(putCall.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: false,
          },
        });
      });

      it('既存のユーザー設定を更新できる（createdAtを保持）', async () => {
        const existingCreatedAt = '2024-01-01T00:00:00Z';
        ddbMock.on(GetCommand).resolves({
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: false,
            isSkip: false,
            createdAt: existingCreatedAt,
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });
        ddbMock.on(PutCommand).resolves({});

        const input: CreateUserSettingInput = {
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: true,
          memo: 'テストメモ',
        };

        const result = await upsertUserVideoSetting(input);

        expect(result.createdAt).toBe(existingCreatedAt);
        expect(result.updatedAt).not.toBe(existingCreatedAt);
        expect(result.isFavorite).toBe(true);
        expect(result.memo).toBe('テストメモ');
      });
    });

    describe('getUserVideoSetting', () => {
      it('ユーザー設定を取得できる', async () => {
        const mockItem = {
          PK: 'USER#user123',
          SK: 'VIDEO#sm12345678',
          entityType: 'USER_SETTING',
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: false,
          memo: 'テストメモ',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        };

        ddbMock.on(GetCommand).resolves({ Item: mockItem });

        const setting = await getUserVideoSetting('user123', 'sm12345678');

        expect(setting).not.toBeNull();
        expect(setting?.userId).toBe('user123');
        expect(setting?.videoId).toBe('sm12345678');
        expect(setting?.isFavorite).toBe(true);
        expect(setting?.memo).toBe('テストメモ');
        expect(setting).not.toHaveProperty('PK');
        expect(setting).not.toHaveProperty('SK');
        expect(setting).not.toHaveProperty('entityType');
      });

      it('存在しない設定はnullを返す', async () => {
        ddbMock.on(GetCommand).resolves({});

        const setting = await getUserVideoSetting('user123', 'sm99999999');

        expect(setting).toBeNull();
      });
    });

    describe('updateUserVideoSetting', () => {
      it('お気に入りを更新できる', async () => {
        ddbMock.on(UpdateCommand).resolves({
          Attributes: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: false,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T01:00:00Z',
          },
        });

        const update: VideoSettingUpdate = {
          isFavorite: true,
        };

        const result = await updateUserVideoSetting('user123', 'sm12345678', update);

        expect(result.isFavorite).toBe(true);
        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input.UpdateExpression).toContain('#isFavorite = :isFavorite');
        expect(call.args[0].input.UpdateExpression).toContain('#updatedAt = :updatedAt');
        expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
      });

      it('複数の設定を同時に更新できる', async () => {
        ddbMock.on(UpdateCommand).resolves({
          Attributes: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: true,
            memo: 'テストメモ',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T01:00:00Z',
          },
        });

        const update: VideoSettingUpdate = {
          isFavorite: true,
          isSkip: true,
          memo: 'テストメモ',
        };

        await updateUserVideoSetting('user123', 'sm12345678', update);

        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input.UpdateExpression).toContain('#isFavorite = :isFavorite');
        expect(call.args[0].input.UpdateExpression).toContain('#isSkip = :isSkip');
        expect(call.args[0].input.UpdateExpression).toContain('#memo = :memo');
      });

      it('更新する項目が指定されていない場合はエラーを返す', async () => {
        await expect(
          updateUserVideoSetting('user123', 'sm12345678', {})
        ).rejects.toThrow('更新する項目が指定されていません');
      });

      it('存在しない設定を更新しようとするとエラーになる', async () => {
        const error = new Error('ConditionalCheckFailedException');
        error.name = 'ConditionalCheckFailedException';
        ddbMock.on(UpdateCommand).rejects(error);

        const update: VideoSettingUpdate = {
          isFavorite: true,
        };

        await expect(
          updateUserVideoSetting('user123', 'sm99999999', update)
        ).rejects.toThrow('ConditionalCheckFailedException');
      });
    });

    describe('listUserVideoSettings', () => {
      it('ユーザーの全動画設定を取得できる', async () => {
        const mockItems = [
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm1',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm1',
            isFavorite: true,
            isSkip: false,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm2',
            entityType: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm2',
            isFavorite: false,
            isSkip: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ];

        ddbMock.on(QueryCommand).resolves({ Items: mockItems });

        const result = await listUserVideoSettings('user123');

        expect(result.settings).toHaveLength(2);
        expect(result.settings[0].videoId).toBe('sm1');
        expect(result.settings[1].videoId).toBe('sm2');
        expect(result.settings[0]).not.toHaveProperty('PK');
      });

      it('ページネーションに対応している', async () => {
        const lastKey = { PK: 'USER#user123', SK: 'VIDEO#sm100' };
        ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });

        const result = await listUserVideoSettings('user123', { limit: 50 });

        expect(result.lastEvaluatedKey).toEqual(lastKey);
        const call = ddbMock.call(0);
        expect(call.args[0].input.Limit).toBe(50);
      });
    });

    describe('deleteUserVideoSetting', () => {
      it('ユーザー設定を削除できる', async () => {
        ddbMock.on(DeleteCommand).resolves({});

        await deleteUserVideoSetting('user123', 'sm12345678');

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
  });
});
