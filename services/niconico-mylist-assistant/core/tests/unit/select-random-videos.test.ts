// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { selectRandomVideos } from '../../src/db/videos';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('selectRandomVideos', () => {
  beforeEach(() => {
    ddbMock.reset();
    jest.restoreAllMocks();
  });

  it('maxCount が 0 以下の場合は空配列を返す', async () => {
    const result = await selectRandomVideos({ userId: 'user123', maxCount: 0 });

    expect(result).toEqual([]);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('150件から2件をReservoir Samplingで選択できる', async () => {
    const settings = Array.from({ length: 150 }, (_, i) => ({
      PK: 'USER#user123',
      SK: `VIDEO#sm${i + 1}`,
      entityType: 'USER_SETTING',
      userId: 'user123',
      videoId: `sm${i + 1}`,
      isFavorite: false,
      isSkip: false,
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));

    ddbMock.on(QueryCommand).resolves({ Items: settings });
    ddbMock.on(BatchGetCommand).callsFake((input) => {
      const keys = input.RequestItems?.['test-table']?.Keys ?? [];
      return {
        Responses: {
          'test-table': keys.map((key) => {
            const videoId = String(key.PK).replace('VIDEO#', '');
            return {
              PK: key.PK,
              SK: key.SK,
              entityType: 'VIDEO',
              videoId,
              title: `動画${videoId}`,
              thumbnailUrl: `https://example.com/${videoId}.jpg`,
              length: '3:00',
              CreatedAt: 1704067200000,
            };
          }),
        },
      };
    });

    jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 2,
    });

    expect(result).toHaveLength(2);
    expect(result.map((video) => video.videoId)).toEqual(['sm150', 'sm2']);
  });

  it('favoriteOnly と skipExclude の両方を適用できる', async () => {
    const settings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
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
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm2',
        isFavorite: true,
        isSkip: true,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm3',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm3',
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: settings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': [
          {
            PK: 'VIDEO#sm1',
            SK: 'VIDEO#sm1',
            entityType: 'VIDEO',
            videoId: 'sm1',
            title: '動画1',
            thumbnailUrl: 'https://example.com/1.jpg',
            length: '3:00',
            CreatedAt: 1704067200000,
          },
        ],
      },
    });

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 10,
      favoriteOnly: true,
      skipExclude: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('sm1');
  });

  it('置換条件を満たさない場合は既存のリザーバを維持する', async () => {
    const settings = Array.from({ length: 3 }, (_, i) => ({
      PK: 'USER#user123',
      SK: `VIDEO#sm${i + 1}`,
      entityType: 'USER_SETTING',
      userId: 'user123',
      videoId: `sm${i + 1}`,
      isFavorite: false,
      isSkip: false,
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));

    ddbMock.on(QueryCommand).resolves({ Items: settings });
    ddbMock.on(BatchGetCommand).callsFake((input) => {
      const keys = input.RequestItems?.['test-table']?.Keys ?? [];
      return {
        Responses: {
          'test-table': keys.map((key) => {
            const videoId = String(key.PK).replace('VIDEO#', '');
            return {
              PK: key.PK,
              SK: key.SK,
              entityType: 'VIDEO',
              videoId,
              title: `動画${videoId}`,
              thumbnailUrl: `https://example.com/${videoId}.jpg`,
              length: '3:00',
              CreatedAt: 1704067200000,
            };
          }),
        },
      };
    });

    jest.spyOn(Math, 'random').mockReturnValue(0.9);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 2,
    });

    expect(result.map((video) => video.videoId)).toEqual(['sm1', 'sm2']);
  });

  it('フィルタ後に動画が0件の場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 5,
      favoriteOnly: true,
    });

    expect(result).toEqual([]);
  });
});
