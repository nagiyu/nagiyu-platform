// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { selectRandomVideos } from '../../src/db/videos';

const ddbMock = mockClient(DynamoDBDocumentClient);

function createSettings(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({
    PK: 'USER#user123',
    SK: `VIDEO#sm${i + 1}`,
    entityType: 'USER_SETTING',
    userId: 'user123',
    videoId: `sm${i + 1}`,
    isFavorite: i % 2 === 0,
    isSkip: i % 3 === 0,
    CreatedAt: 1704067200000,
    UpdatedAt: 1704067200000,
  }));
}

function mockQuery(settings: Array<Record<string, unknown>>): void {
  if (settings.length > 100) {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: settings.slice(0, 100),
        LastEvaluatedKey: {
          PK: 'USER#user123',
          SK: 'VIDEO#sm100',
        },
      })
      .resolvesOnce({
        Items: settings.slice(100),
      });
    return;
  }

  ddbMock.on(QueryCommand).resolves({ Items: settings });
}

function mockScan(settings: Array<Record<string, unknown>>): void {
  ddbMock.on(ScanCommand).resolves({
    Items: settings.map((setting) => {
      const videoId = String(setting.videoId);
      return {
        PK: `VIDEO#${videoId}`,
        SK: `VIDEO#${videoId}`,
        entityType: 'VIDEO',
        videoId,
        title: `動画${videoId}`,
        thumbnailUrl: `https://example.com/${videoId}.jpg`,
        length: '3:00',
        CreatedAt: 1704067200000,
      };
    }),
  });
}

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

  it('フィルタ後の動画数が maxCount 未満の場合は全件を返す', async () => {
    const settings = createSettings(50);
    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 100,
    });

    expect(result).toHaveLength(50);
  });

  it('フィルタ後の動画数が maxCount ちょうどの場合は全件を返す', async () => {
    const settings = createSettings(100);
    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 100,
    });

    expect(result).toHaveLength(100);
  });

  it('フィルタ後の動画数が maxCount を超える場合は maxCount 件を返す', async () => {
    const settings = createSettings(150);
    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 100,
    });

    expect(result).toHaveLength(100);
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
    expect(ddbMock.commandCalls(ScanCommand)).toHaveLength(1);
    expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input).toMatchObject({
      TableName: 'test-table',
      FilterExpression: 'begins_with(PK, :videoPrefix) AND begins_with(SK, :videoPrefix)',
    });
  });

  it('favoriteOnly フィルタが正しく適用される', async () => {
    const settings = createSettings(20);
    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 20,
      favoriteOnly: true,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((video) => video.userSetting?.isFavorite === true)).toBe(true);
  });

  it('skipExclude フィルタが正しく適用される', async () => {
    const settings = createSettings(20);
    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 20,
      skipExclude: true,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((video) => video.userSetting?.isSkip === false)).toBe(true);
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

    mockQuery(settings);
    mockScan(settings);

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 10,
      favoriteOnly: true,
      skipExclude: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe('sm1');
  });

  it('maxCount が 1 の場合は 1件返す', async () => {
    const settings = createSettings(150);
    mockQuery(settings);
    mockScan(settings);
    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 1,
    });

    expect(result).toHaveLength(1);
  });

  it('maxCount が 100 の場合は最大100件返す', async () => {
    const settings = createSettings(150);
    mockQuery(settings);
    mockScan(settings);
    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 100,
    });

    expect(result).toHaveLength(100);
  });

  it('フィルタ後に動画が0件の場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const result = await selectRandomVideos({
      userId: 'user123',
      maxCount: 5,
      favoriteOnly: true,
    });

    expect(result).toEqual([]);
  });

  it('同じ入力で複数回呼び出すと異なる結果が含まれる', async () => {
    const settings = createSettings(80);
    mockQuery(settings);
    mockScan(settings);

    const results: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const videos = await selectRandomVideos({
        userId: 'user123',
        maxCount: 50,
      });
      results.push(videos.map((video) => video.videoId).join(','));
    }

    const signatures = new Set(results);
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('十分な試行回数で全要素が選ばれる機会がある', async () => {
    const settings = createSettings(10);
    mockQuery(settings);
    mockScan(settings);

    const selectedVideoIds = new Set<string>();

    for (let i = 0; i < 200; i += 1) {
      const result = await selectRandomVideos({
        userId: 'user123',
        maxCount: 3,
      });
      result.forEach((video) => selectedVideoIds.add(video.videoId));
    }

    expect(selectedVideoIds.size).toBe(10);
  });
});
