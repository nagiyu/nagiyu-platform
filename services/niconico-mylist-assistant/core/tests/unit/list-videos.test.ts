// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
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
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm3',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm3',
        isFavorite: false,
        isSkip: false,
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
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
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        entityType: 'VIDEO',
        videoId: 'sm3',
        title: '動画3',
        thumbnailUrl: 'https://example.com/3.jpg',
        length: '5:00',
        createdAt: '2024-01-03T00:00:00Z',
      },
    ];

    // QueryCommandのモック（ユーザー設定取得）
    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });

    // BatchGetCommandのモック（動画基本情報取得）
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

    const result = await listVideosWithSettings('user123');

    expect(result.videos).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].title).toBe('動画1');
    expect(result.videos[0].userSetting?.isFavorite).toBe(true);
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
        isSkip: false,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
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
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

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
        isSkip: false,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
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
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

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
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm2',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm2',
        isFavorite: true,
        isSkip: true,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm3',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm3',
        isFavorite: false,
        isSkip: false,
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
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
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

    // お気に入り かつ スキップでない
    const result = await listVideosWithSettings('user123', {
      isFavorite: true,
      isSkip: false,
    });

    expect(result.videos).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.videos[0].videoId).toBe('sm1');
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }));

    const mockVideos = Array.from({ length: 3 }, (_, i) => ({
      PK: `VIDEO#sm${i + 6}`,
      SK: `VIDEO#sm${i + 6}`,
      entityType: 'VIDEO',
      videoId: `sm${i + 6}`,
      title: `動画${i + 6}`,
      thumbnailUrl: `https://example.com/${i + 6}.jpg`,
      length: '3:00',
      createdAt: '2024-01-01T00:00:00Z',
    }));

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

    // 6件目から3件取得（offset: 5, limit: 3）
    const result = await listVideosWithSettings('user123', {
      limit: 3,
      offset: 5,
    });

    expect(result.videos).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.videos[0].videoId).toBe('sm6');
    expect(result.videos[1].videoId).toBe('sm7');
    expect(result.videos[2].videoId).toBe('sm8');
  });

  it('動画基本情報が存在しない場合はスキップする', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        entityType: 'USER_SETTING',
        userId: 'user123',
        videoId: 'sm1',
        isFavorite: false,
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
        isSkip: false,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
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
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        'test-table': mockVideos,
      },
    });

    const result = await listVideosWithSettings('user123');

    // 動画基本情報が存在するsm1のみ返される
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('sm1');
    // totalは設定の総数
    expect(result.total).toBe(2);
  });

  it('動画が存在しない場合は空配列を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await listVideosWithSettings('user123');

    expect(result.videos).toEqual([]);
    expect(result.total).toBe(0);
  });
});
