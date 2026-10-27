// テスト実行前にDYNAMODB_TABLE_NAMEを設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
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
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm3',
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm3',
        IsFavorite: false,
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    // 動画基本情報のモック
    const mockVideos = [
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
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        Type: 'VIDEO',
        VideoID: 'sm3',
        Title: '動画3',
        ThumbnailURL: 'https://example.com/3.jpg',
        Length: '5:00',
        CreatedAt: 1704067200000,
      },
      {
        PK: 'VIDEO#sm4',
        SK: 'VIDEO#sm4',
        Type: 'VIDEO',
        VideoID: 'sm4',
        Title: '動画4',
        ThumbnailURL: 'https://example.com/4.jpg',
        Length: '6:00',
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: true,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
        IsFavorite: true,
        IsSkip: true,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm3',
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm3',
        IsFavorite: false,
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '東方アレンジメドレー',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
        CreatedAt: 1704067200000,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        Type: 'VIDEO',
        VideoID: 'sm2',
        Title: 'ボーカロイド特集',
        ThumbnailURL: 'https://example.com/2.jpg',
        Length: '4:00',
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: 'ボーカロイド特集',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: 'Touhou Arrange',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '東方アレンジ',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
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
      Type: 'USER_SETTING',
      UserID: 'user123',
      VideoID: `sm${i + 1}`,
      IsFavorite: false,
      IsSkip: false,
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));

    const mockVideos = Array.from({ length: 10 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      Type: 'VIDEO',
      VideoID: `sm${i + 1}`,
      Title: `動画${i + 1}`,
      ThumbnailURL: `https://example.com/${i + 1}.jpg`,
      Length: '3:00',
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
    expect(result.videos[0].createdAt).toBeGreaterThan(result.videos[1].createdAt);
    expect(result.videos[1].createdAt).toBeGreaterThan(result.videos[2].createdAt);
  });

  it('limit未指定時はフィルタ後の動画を全件返す', async () => {
    const mockSettings = Array.from({ length: 60 }, (_, i) => ({
      PK: 'USER#user123',
      SK: `VIDEO#sm${i + 1}`,
      Type: 'USER_SETTING',
      UserID: 'user123',
      VideoID: `sm${i + 1}`,
      IsFavorite: false,
      IsSkip: false,
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));

    const mockVideos = Array.from({ length: 60 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      Type: 'VIDEO',
      VideoID: `sm${i + 1}`,
      Title: `動画${i + 1}`,
      ThumbnailURL: `https://example.com/${i + 1}.jpg`,
      Length: '3:00',
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
      Type: 'USER_SETTING',
      UserID: 'user123',
      VideoID: `sm${i + 1}`,
      IsFavorite: false,
      IsSkip: false,
      CreatedAt: 1704067200000,
      UpdatedAt: 1704067200000,
    }));

    const mockVideos = Array.from({ length: 100 }, (_, i) => ({
      PK: `VIDEO#sm${i + 1}`,
      SK: `VIDEO#sm${i + 1}`,
      Type: 'VIDEO',
      VideoID: `sm${i + 1}`,
      Title: `動画${i + 1}`,
      ThumbnailURL: `https://example.com/${i + 1}.jpg`,
      Length: '3:00',
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
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    // sm1の動画情報のみ存在
    const mockVideos = [
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

  // --- スキップ除外フィルタの回帰テスト ---
  // バグ修正: isSkip=false のとき「設定なし動画を候補から除外」していた不具合の回帰テスト
  // USER_SETTING は UI 操作時のみ作成されるため、設定を持たない動画（＝スキップ指定なし）は
  // skipExclude 時に候補に含めるべきである。

  it('【回帰】isSkip=false のとき設定レコードを持たない動画が候補に残る', async () => {
    // USER_SETTING は sm1 のみ（isSkip=true）。sm2, sm3 は設定なし（スキップ指定なし）
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: true,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '動画1（スキップ指定あり）',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
        CreatedAt: 1704067200003,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        Type: 'VIDEO',
        VideoID: 'sm2',
        Title: '動画2（設定なし）',
        ThumbnailURL: 'https://example.com/2.jpg',
        Length: '4:00',
        CreatedAt: 1704067200002,
      },
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        Type: 'VIDEO',
        VideoID: 'sm3',
        Title: '動画3（設定なし）',
        ThumbnailURL: 'https://example.com/3.jpg',
        Length: '5:00',
        CreatedAt: 1704067200001,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    // スキップ除外: 設定なし動画は「スキップ指定なし」として候補に含まれるべき
    const result = await listVideosWithSettings('user123', { isSkip: false });

    expect(result.total).toBe(2);
    expect(result.videos).toHaveLength(2);
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).toContain('sm2');
    expect(videoIds).toContain('sm3');
    // sm1 は isSkip=true なので除外される
    expect(videoIds).not.toContain('sm1');
  });

  it('【回帰】isSkip=false のとき明示的に isSkip=true の動画は除外される', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: true,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '動画1（スキップ指定あり）',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
        CreatedAt: 1704067200002,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        Type: 'VIDEO',
        VideoID: 'sm2',
        Title: '動画2（スキップ指定なし）',
        ThumbnailURL: 'https://example.com/2.jpg',
        Length: '4:00',
        CreatedAt: 1704067200001,
      },
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        Type: 'VIDEO',
        VideoID: 'sm3',
        Title: '動画3（設定なし）',
        ThumbnailURL: 'https://example.com/3.jpg',
        Length: '5:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    const result = await listVideosWithSettings('user123', { isSkip: false });

    // sm1（isSkip=true）は除外、sm2（isSkip=false）と sm3（設定なし）は含まれる
    expect(result.total).toBe(2);
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).not.toContain('sm1');
    expect(videoIds).toContain('sm2');
    expect(videoIds).toContain('sm3');
  });

  // --- お気に入り以外フィルタの回帰テスト ---
  // バグ修正: isFavorite=false のとき「設定なし動画を除外」していた不具合の回帰テスト
  // USER_SETTING は UI 操作時のみ作成されるため、設定を持たない動画は「お気に入りでない」として扱う。

  const createSetting = (videoId: string, isFavorite: boolean, isSkip: boolean) => ({
    PK: 'USER#user123',
    SK: `VIDEO#${videoId}`,
    Type: 'USER_SETTING',
    UserID: 'user123',
    VideoID: videoId,
    IsFavorite: isFavorite,
    IsSkip: isSkip,
    CreatedAt: 1704067200000,
    UpdatedAt: 1704067200000,
  });

  const createVideo = (videoId: string, title: string, createdAt: number) => ({
    PK: `VIDEO#${videoId}`,
    SK: `VIDEO#${videoId}`,
    Type: 'VIDEO',
    VideoID: videoId,
    Title: title,
    ThumbnailURL: `https://example.com/${videoId}.jpg`,
    Length: '3:00',
    CreatedAt: createdAt,
  });

  it('【回帰】isFavorite=false のとき設定レコードを持たない動画が残る', async () => {
    // sm1 のみ設定あり（isFavorite=true）。sm2, sm3 は設定なし
    ddbMock.on(QueryCommand).resolves({ Items: [createSetting('sm1', true, false)] });
    ddbMock.on(ScanCommand).resolves({
      Items: [
        createVideo('sm1', '動画1（お気に入り）', 1704067200003),
        createVideo('sm2', '動画2（設定なし）', 1704067200002),
        createVideo('sm3', '動画3（設定なし）', 1704067200001),
      ],
    });

    const result = await listVideosWithSettings('user123', { isFavorite: false });

    expect(result.total).toBe(2);
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).toContain('sm2');
    expect(videoIds).toContain('sm3');
    expect(videoIds).not.toContain('sm1');
  });

  it('【回帰】isFavorite=false のとき明示的に isFavorite=true の動画は除外され、isFavorite=false の設定ありの動画は残る', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [createSetting('sm1', true, false), createSetting('sm2', false, false)],
    });
    ddbMock.on(ScanCommand).resolves({
      Items: [
        createVideo('sm1', '動画1（お気に入り）', 1704067200002),
        createVideo('sm2', '動画2（お気に入りでない設定あり）', 1704067200001),
        createVideo('sm3', '動画3（設定なし）', 1704067200000),
      ],
    });

    const result = await listVideosWithSettings('user123', { isFavorite: false });

    expect(result.total).toBe(2);
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).not.toContain('sm1');
    expect(videoIds).toContain('sm2');
    expect(videoIds).toContain('sm3');
  });

  it('【回帰】isFavorite=false と isSkip=false を組み合わせたとき設定なしは残り、isSkip=true は除外される', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [createSetting('sm1', false, true), createSetting('sm2', false, false)],
    });
    ddbMock.on(ScanCommand).resolves({
      Items: [
        createVideo('sm1', '動画1（スキップ指定あり）', 1704067200002),
        createVideo('sm2', '動画2（設定あり・スキップなし）', 1704067200001),
        createVideo('sm3', '動画3（設定なし）', 1704067200000),
      ],
    });

    const result = await listVideosWithSettings('user123', { isFavorite: false, isSkip: false });

    expect(result.total).toBe(2);
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).not.toContain('sm1');
    expect(videoIds).toContain('sm2');
    expect(videoIds).toContain('sm3');
  });

  it('isSkip=true のとき設定ありかつ isSkip=true の動画だけが返る', async () => {
    const mockSettings = [
      {
        PK: 'USER#user123',
        SK: 'VIDEO#sm1',
        Type: 'USER_SETTING',
        UserID: 'user123',
        VideoID: 'sm1',
        IsFavorite: false,
        IsSkip: true,
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
        IsSkip: false,
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067200000,
      },
    ];

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '動画1（スキップ指定あり）',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
        CreatedAt: 1704067200002,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        Type: 'VIDEO',
        VideoID: 'sm2',
        Title: '動画2（スキップ指定なし）',
        ThumbnailURL: 'https://example.com/2.jpg',
        Length: '4:00',
        CreatedAt: 1704067200001,
      },
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        Type: 'VIDEO',
        VideoID: 'sm3',
        Title: '動画3（設定なし）',
        ThumbnailURL: 'https://example.com/3.jpg',
        Length: '5:00',
        CreatedAt: 1704067200000,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    // isSkip=true 指定（一覧 API 相当）: 明示的に isSkip=true のものだけ返す
    const result = await listVideosWithSettings('user123', { isSkip: true });

    expect(result.total).toBe(1);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting?.isSkip).toBe(true);
    // sm2（isSkip=false）と sm3（設定なし）は含まれない
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).not.toContain('sm2');
    expect(videoIds).not.toContain('sm3');
  });

  it('favoriteOnly と isSkip=false を組み合わせたとき設定なし動画は isFavorite を持たないため除外される', async () => {
    // 設定なし動画は isFavorite が undefined なので favoriteOnly=true には含まれない（正しい挙動）
    const mockSettings = [
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

    const mockVideos = [
      {
        PK: 'VIDEO#sm1',
        SK: 'VIDEO#sm1',
        Type: 'VIDEO',
        VideoID: 'sm1',
        Title: '動画1（お気に入り・スキップなし）',
        ThumbnailURL: 'https://example.com/1.jpg',
        Length: '3:00',
        CreatedAt: 1704067200003,
      },
      {
        PK: 'VIDEO#sm2',
        SK: 'VIDEO#sm2',
        Type: 'VIDEO',
        VideoID: 'sm2',
        Title: '動画2（お気に入りなし・スキップあり）',
        ThumbnailURL: 'https://example.com/2.jpg',
        Length: '4:00',
        CreatedAt: 1704067200002,
      },
      {
        PK: 'VIDEO#sm3',
        SK: 'VIDEO#sm3',
        Type: 'VIDEO',
        VideoID: 'sm3',
        Title: '動画3（設定なし）',
        ThumbnailURL: 'https://example.com/3.jpg',
        Length: '5:00',
        CreatedAt: 1704067200001,
      },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockSettings });
    ddbMock.on(ScanCommand).resolves({ Items: mockVideos });

    // favoriteOnly=true かつ スキップ除外
    const result = await listVideosWithSettings('user123', { isFavorite: true, isSkip: false });

    // sm1 のみ: isFavorite=true かつ isSkip!==true
    expect(result.total).toBe(1);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe('sm1');
    // sm3（設定なし）は isFavorite が undefined なので favoriteOnly=true フィルタで除外される（正しい挙動）
    const videoIds = result.videos.map((v) => v.videoId);
    expect(videoIds).not.toContain('sm2');
    expect(videoIds).not.toContain('sm3');
  });

  it('ユーザー設定が存在しない場合でも動画基本情報を取得できる', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(ScanCommand).resolves({
      Items: [
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
      ],
    });

    const result = await listVideosWithSettings('new-user');

    expect(result.videos).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.videos[0].videoId).toBe('sm1');
    expect(result.videos[0].userSetting).toBeUndefined();
  });
});
