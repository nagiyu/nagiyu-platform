// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { listVideosWithSettings } from '../../src/db/videos';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('listVideosWithSettings', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('ユーザーの動画一覧を取得できる', async () => {
    // ユーザー設定のモック
    const mockSettings = [
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
        isFavorite: false,
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

    // 動画基本情報のモック
    const mockVideos = [
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
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        entityType: 'VIDEO',
        videoId: 'sm2',
        title: '動画2',
        thumbnailUrl: 'https://example.com/2.jpg',
        length: '4:00',
        CreatedAt: 1704067200000,
      },
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        entityType: 'VIDEO',
        videoId: 'sm3',
        title: '動画3',
        thumbnailUrl: 'https://example.com/3.jpg',
        length: '5:00',
        CreatedAt: 1704067200000,
      },
      {
        PK: 'VIDEO#sm4',
        SK: 'VIDEO#sm4',
        entityType: 'VIDEO',
        videoId: 'sm4',
        title: '動画4',
        thumbnailUrl: 'https://example.com/4.jpg',
        length: '6:00',
        CreatedAt: 1704067200000,
      },
    ];

    // QueryCommandのモック（ユーザー設定取得）
    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123');

    expect(result.videos).toHaveLength(4);
    expect(result.total).toBe(4);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].title).toBe('動画1');
    expect(result.videos[0].userSetting?.isFavorite).toBe(true);
    expect(result.videos[3].videoId).toBe('sm4');
    expect(result.videos[3].userSetting).toBeUndefined();
  });

  it('お気に入りフィルタが正しく動作する', async () => {
    const mockSettings = [
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
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { isFavorite: true });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting?.isFavorite).toBe(true);
  });

  it('スキップフィルタが正しく動作する', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
        isSkip: true,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm2',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm2',
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { isSkip: true });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting?.isSkip).toBe(true);
  });

  it('複数のフィルタを同時に適用できる（AND条件）', async () => {
    const mockSettings = [
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

    const mockVideos = [
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
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    // お気に入り かつ スキップでない
    const result = await listVideosWithSettings('user123', {
      isFavorite: true,
      isSkip: false,
    });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
  });

  it('検索キーワードあり（一致）で該当動画のみ返す', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
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
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        entityType: 'VIDEO',
        videoId: 'sm1',
        title: '東方アレンジメドレー',
        thumbnailUrl: 'https://example.com/1.jpg',
        length: '3:00',
        CreatedAt: 1704067200000,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        entityType: 'VIDEO',
        videoId: 'sm2',
        title: 'ボーカロイド特集',
        thumbnailUrl: 'https://example.com/2.jpg',
        length: '4:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { searchKeyword: '東方' });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
  });

  it('検索キーワードあり（不一致）で空配列を返す', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        entityType: 'VIDEO',
        videoId: 'sm1',
        title: 'ボーカロイド特集',
        thumbnailUrl: 'https://example.com/1.jpg',
        length: '3:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { searchKeyword: '東方' });

    expect(result.videos).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('検索キーワードは大文字小文字を区別せず部分一致する', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        entityType: 'VIDEO',
        videoId: 'sm1',
        title: 'Touhou Arrange',
        thumbnailUrl: 'https://example.com/1.jpg',
        length: '3:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { searchKeyword: 'touHOU' });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
  });

  it('検索キーワードと既存フィルタをAND条件で適用できる', async () => {
    const mockSettings = [
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
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        entityType: 'VIDEO',
        videoId: 'sm1',
        title: '東方アレンジ',
        thumbnailUrl: 'https://example.com/1.jpg',
        length: '3:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', {
      searchKeyword: '東方',
      isFavorite: true,
      isSkip: false,
    });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting?.isFavorite).toBe(true);
  });

  it('空文字列・空白のみの検索キーワードは検索条件なしとして扱う', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
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
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        entityType: 'VIDEO',
        videoId: 'sm2',
        title: '動画2',
        thumbnailUrl: 'https://example.com/2.jpg',
        length: '4:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { searchKeyword: '   ' });

    expect(result.videos).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('ページネーションが正しく動作する（offset/limit方式）', async () => {
    const mockSettings = Array.from({ length: 10 }, (_, i) => ({
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

    const mockVideos = Array.from({ length: 10 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      entityType: 'VIDEO',
      videoId: `sm${i + 1}`,
      title: `動画${i + 1}`,
      thumbnailUrl: `https://example.com/${i + 1}.jpg`,
      length: '3:00',
      CreatedAt: 1704067200000 - i,
    }));

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    // 全10件から6〜8件目を取得（offset: 5, limit: 3）
    const result = await listVideosWithSettings('user123', {
      limit: 3,
      offset: 5,
    });

    expect(result.videos).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.videos[0].videoId).toBe('sm6');
    expect(result.videos[1].videoId).toBe('sm7');
    expect(result.videos[2].videoId).toBe('sm8');
    expect(result.videos[0].CreatedAt).toBeGreaterThan(result.videos[1].CreatedAt);
    expect(result.videos[1].CreatedAt).toBeGreaterThan(result.videos[2].CreatedAt);
  });

  it('limit未指定時はフィルタ後の動画を全件返す', async () => {
    const mockSettings = Array.from({ length: 60 }, (_, i) => ({
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

    const mockVideos = Array.from({ length: 60 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      entityType: 'VIDEO',
      videoId: `sm${i + 1}`,
      title: `動画${i + 1}`,
      thumbnailUrl: `https://example.com/${i + 1}.jpg`,
      length: '3:00',
      CreatedAt: 1704067200000,
    }));

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123');

    expect(result.videos).toHaveLength(60);
    expect(result.total).toBe(60);
  });

  it('limit指定時は指定件数のみ返す', async () => {
    const mockSettings = Array.from({ length: 100 }, (_, i) => ({
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

    const mockVideos = Array.from({ length: 100 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      entityType: 'VIDEO',
      videoId: `sm${i + 1}`,
      title: `動画${i + 1}`,
      thumbnailUrl: `https://example.com/${i + 1}.jpg`,
      length: '3:00',
      CreatedAt: 1704067200000,
    }));

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { limit: 50 });

    expect(result.videos).toHaveLength(50);
    expect(result.total).toBe(100);
  });

  it('動画基本情報が存在しない場合は結果に含まれない', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
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
        isFavorite: false,
        isSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    // sm1の動画情報のみ存在
    const mockVideos = [
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
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123');

    // 動画基本情報が存在するsm1のみ返される
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.total).toBe(1);
  });

  it('動画が存在しない場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    const result = await listVideosWithSettings('user123');

    expect(result.videos).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('ユーザー設定が存在しない場合でも動画基本情報を取得できる', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(ScanCommand).resolves({
      Items: [
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
        {
          PK: 'VIDEO#sm2',
          SK: 'VIDEO#sm2',
          entityType: 'VIDEO',
          videoId: 'sm2',
          title: '動画2',
          thumbnailUrl: 'https://example.com/2.jpg',
          length: '4:00',
          CreatedAt: 1704067200000,
        },
      ],
    });

    const result = await listVideosWithSettings('new-user');

    expect(result.videos).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting).toBeUndefined();
  });
});
