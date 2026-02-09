// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

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
        expect(result.CreatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'VIDEO#sm12345678',
            SK: 'VIDEO#sm12345678',
            Type: 'VIDEO',
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

        await expect(createVideoBasicInfo(input)).rejects.toThrow('エンティティは既に存在します');
      });
    });

    describe('getVideoBasicInfo', () => {
      it('動画基本情報を取得できる', async () => {
        const mockItem = {
          PK: 'VIDEO#sm12345678',
          SK: 'VIDEO#sm12345678',
          Type: 'VIDEO',
          videoId: 'sm12345678',
          title: 'テスト動画',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          length: '5:30',
          CreatedAt: 1704067200000,
        };

        ddbMock.on(GetCommand).resolves({ Item: mockItem });

        const video = await getVideoBasicInfo('sm12345678');

        expect(video).not.toBeNull();
        expect(video?.videoId).toBe('sm12345678');
        expect(video?.title).toBe('テスト動画');
        expect(video).not.toHaveProperty('PK');
        expect(video).not.toHaveProperty('SK');
        expect(video).not.toHaveProperty('Type');
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
            Type: 'VIDEO',
            videoId: 'sm1',
            title: '動画1',
            thumbnailUrl: 'https://example.com/1.jpg',
            length: '3:00',
            CreatedAt: 1704067200000,
          },
          {
            PK: 'VIDEO#sm2',
            SK: 'VIDEO#sm2',
            Type: 'VIDEO',
            videoId: 'sm2',
            title: '動画2',
            thumbnailUrl: 'https://example.com/2.jpg',
            length: '4:00',
            CreatedAt: 1704067200000,
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
          'batchGet: 最大100件まで取得可能です'
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
        expect(result.CreatedAt).toBeDefined();
        expect(result.UpdatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(1);
        const call = ddbMock.call(0);
        expect(call.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
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

        await expect(createUserVideoSetting(input)).rejects.toThrow('エンティティは既に存在します');
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
        expect(result.CreatedAt).toBeDefined();
        expect(result.UpdatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(2); // Get + Put
        const putCall = ddbMock.calls()[1];
        expect(putCall.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: false,
          },
        });
      });

      it('既存のユーザー設定を更新できる（createdAtを保持）', async () => {
        const existingCreatedAt = 1704060000000;
        ddbMock.on(GetCommand).resolves({
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: false,
            isSkip: false,
            CreatedAt: existingCreatedAt,
            UpdatedAt: 1704067200000,
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

        expect(result.CreatedAt).toBe(existingCreatedAt);
        expect(result.UpdatedAt).not.toBe(existingCreatedAt);
        expect(result.isFavorite).toBe(true);
        expect(result.memo).toBe('テストメモ');
      });
    });

    describe('getUserVideoSetting', () => {
      it('ユーザー設定を取得できる', async () => {
        const mockItem = {
          PK: 'USER#user123',
          SK: 'VIDEO#sm12345678',
          Type: 'USER_SETTING',
          userId: 'user123',
          videoId: 'sm12345678',
          isFavorite: true,
          isSkip: false,
          memo: 'テストメモ',
          CreatedAt: 1704067200000,
          UpdatedAt: 1704067200000,
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
        expect(setting).not.toHaveProperty('Type');
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
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: false,
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
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
        expect(call.args[0].input.UpdateExpression).toContain('#UpdatedAt = :UpdatedAt');
        expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
      });

      it('複数の設定を同時に更新できる', async () => {
        ddbMock.on(UpdateCommand).resolves({
          Attributes: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm12345678',
            isFavorite: true,
            isSkip: true,
            memo: 'テストメモ',
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
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
        await expect(updateUserVideoSetting('user123', 'sm12345678', {})).rejects.toThrow(
          '更新するフィールドが指定されていません'
        );
      });

      it('存在しない設定を更新しようとするとエラーになる', async () => {
        const error = new Error('ConditionalCheckFailedException');
        error.name = 'ConditionalCheckFailedException';
        ddbMock.on(UpdateCommand).rejects(error);

        const update: VideoSettingUpdate = {
          isFavorite: true,
        };

        await expect(updateUserVideoSetting('user123', 'sm99999999', update)).rejects.toThrow(
          'エンティティが見つかりません'
        );
      });
    });

    describe('listUserVideoSettings', () => {
      it('ユーザーの全動画設定を取得できる', async () => {
        const mockItems = [
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm1',
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm1',
            isFavorite: true,
            isSkip: false,
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
          },
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm2',
            Type: 'USER_SETTING',
            userId: 'user123',
            videoId: 'sm2',
            isFavorite: false,
            isSkip: true,
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
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
