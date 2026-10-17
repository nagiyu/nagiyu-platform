// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

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
  deleteVideoBasicInfo,
} from '../../src/db/videos';
import { reportErrorEvent } from '@nagiyu/aws';
import { parseUpdateExpression } from '../helpers/update-expression.js';
import type {
  CreateVideoBasicInfoInput,
  CreateUserSettingInput,
  VideoSettingUpdate,
} from '../../src/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('videos', () => {
  beforeEach(() => {
    ddbMock.reset();
    jest.mocked(reportErrorEvent).mockClear();
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
            Type: 'VIDEO',
            VideoID: 'sm12345678',
            Title: 'テスト動画',
          },
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': 'PK' },
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

        // 報告は例外を受け止める上位層の責務なので、リポジトリ呼び出し側では報告しない
        expect(jest.mocked(reportErrorEvent)).not.toHaveBeenCalled();
      });
    });

    describe('getVideoBasicInfo', () => {
      it('動画基本情報を取得できる', async () => {
        const mockItem = {
          PK: 'VIDEO#sm12345678',
          SK: 'VIDEO#sm12345678',
          Type: 'VIDEO',
          VideoID: 'sm12345678',
          Title: 'テスト動画',
          ThumbnailURL: 'https://example.com/thumb.jpg',
          Length: '5:30',
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
            VideoID: 'sm1',
            Title: '動画1',
            ThumbnailURL: 'https://example.com/1.jpg',
            Length: '3:00',
            CreatedAt: 1704067200000,
          },
          {
            PK: 'VIDEO#sm2',
            SK: 'VIDEO#sm2',
            Type: 'VIDEO',
            VideoID: 'sm2',
            Title: '動画2',
            ThumbnailURL: 'https://example.com/2.jpg',
            Length: '4:00',
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

      it('100件を超える場合は分割して取得できる', async () => {
        const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i}`);
        ddbMock
          .on(BatchGetCommand)
          .resolvesOnce({
            Responses: {
              'test-table': [
                {
                  PK: 'VIDEO#sm0',
                  SK: 'VIDEO#sm0',
                  Type: 'VIDEO',
                  VideoID: 'sm0',
                  Title: '動画0',
                  ThumbnailURL: 'https://example.com/0.jpg',
                  Length: '3:00',
                  CreatedAt: 1704067200000,
                },
              ],
            },
          })
          .resolvesOnce({
            Responses: {
              'test-table': [
                {
                  PK: 'VIDEO#sm100',
                  SK: 'VIDEO#sm100',
                  Type: 'VIDEO',
                  VideoID: 'sm100',
                  Title: '動画100',
                  ThumbnailURL: 'https://example.com/100.jpg',
                  Length: '3:00',
                  CreatedAt: 1704067200000,
                },
              ],
            },
          });

        const videos = await batchGetVideoBasicInfo(videoIds);
        expect(videos).toHaveLength(2);
        expect(videos.map((video) => video.videoId)).toEqual(['sm0', 'sm100']);
        expect(ddbMock.commandCalls(BatchGetCommand)).toHaveLength(2);
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
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: true,
            IsSkip: false,
          },
          ConditionExpression: 'attribute_not_exists(#pk)',
          ExpressionAttributeNames: { '#pk': 'PK' },
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
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();

        expect(ddbMock.calls()).toHaveLength(2); // Get + Put
        const putCall = ddbMock.calls()[1];
        expect(putCall.args[0].input).toMatchObject({
          TableName: 'test-table',
          Item: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: true,
            IsSkip: false,
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
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: false,
            IsSkip: false,
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
          Type: 'USER_SETTING',
          UserID: 'user123',
          VideoID: 'sm12345678',
          IsFavorite: true,
          IsSkip: false,
          Memo: 'テストメモ',
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
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: true,
            IsSkip: false,
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
        const parsed = parseUpdateExpression(call.args[0].input);
        expect(parsed.set).toEqual({
          IsFavorite: true,
          UpdatedAt: expect.any(Number),
        });
        // 旧属性名が残らないよう同時に削除する
        expect(parsed.remove).toEqual(['isFavorite']);
        expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(#pk)');
      });

      it('複数の設定を同時に更新できる', async () => {
        ddbMock.on(UpdateCommand).resolves({
          Attributes: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: true,
            IsSkip: true,
            Memo: 'テストメモ',
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
        expect(parseUpdateExpression(call.args[0].input).set).toEqual({
          IsFavorite: true,
          IsSkip: true,
          Memo: 'テストメモ',
          UpdatedAt: expect.any(Number),
        });
      });

      it('更新する項目が指定されていない場合は更新日時だけを更新する', async () => {
        ddbMock.on(UpdateCommand).resolves({
          Attributes: {
            PK: 'USER#user123',
            SK: 'VIDEO#sm12345678',
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm12345678',
            IsFavorite: false,
            IsSkip: false,
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067300000,
          },
        });

        await updateUserVideoSetting('user123', 'sm12345678', {});

        expect(ddbMock.calls()).toHaveLength(1);
        const parsed = parseUpdateExpression(ddbMock.call(0).args[0].input);
        expect(parsed.set).toEqual({ UpdatedAt: expect.any(Number) });
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

        // 報告は例外を受け止める上位層の責務なので、リポジトリ呼び出し側では報告しない
        expect(jest.mocked(reportErrorEvent)).not.toHaveBeenCalled();
      });
    });

    describe('listUserVideoSettings', () => {
      it('ユーザーの全動画設定を取得できる', async () => {
        const mockItems = [
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm1',
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm1',
            IsFavorite: true,
            IsSkip: false,
            CreatedAt: 1704067200000,
            UpdatedAt: 1704067200000,
          },
          {
            PK: 'USER#user123',
            SK: 'VIDEO#sm2',
            Type: 'USER_SETTING',
            UserID: 'user123',
            VideoID: 'sm2',
            IsFavorite: false,
            IsSkip: true,
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

    describe('deleteVideoBasicInfo', () => {
      it('対象がなくても成功し、存在を条件にしない削除を送る', async () => {
        ddbMock.on(DeleteCommand).resolves({});

        await expect(deleteVideoBasicInfo('sm99999999')).resolves.toBeUndefined();

        const input = ddbMock.call(0).args[0].input;
        expect(input).toMatchObject({
          Key: { PK: 'VIDEO#sm99999999', SK: 'VIDEO#sm99999999' },
        });
        expect(input).not.toHaveProperty('ConditionExpression');
      });
    });

    describe('deleteUserVideoSetting', () => {
      it('対象がなくても成功し、存在を条件にしない削除を送る', async () => {
        ddbMock.on(DeleteCommand).resolves({});

        await expect(deleteUserVideoSetting('user123', 'sm99999999')).resolves.toBeUndefined();

        expect(ddbMock.call(0).args[0].input).not.toHaveProperty('ConditionExpression');
      });

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
