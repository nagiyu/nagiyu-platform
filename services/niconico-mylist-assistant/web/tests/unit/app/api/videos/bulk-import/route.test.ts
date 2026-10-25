/**
 * @jest-environment node
 */

/**
 * POST /api/videos/bulk-import のユニットテスト
 *
 * 認証チェック・バリデーション・スキップ判定を、実ニコニコ動画APIを呼ばずに検証する。
 *
 * E2E（tests/e2e/bulk-import.spec.ts）では
 * - 未認証時の 401 は SKIP_AUTH_CHECK=true の環境では再現できないため検証できない
 * - 「標準・任意の英字接頭辞を持つ動画IDを受理する」動作は、実際に受理されて
 *   getVideoInfoBatch まで到達したことそのものはユニットテストでしか決定的に確認できない
 * ため、このユニットテストで代替担保する。
 */

// モック：next-auth セッション
jest.mock('../../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（ニコニコAPI呼び出し・DB操作）
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  getVideoInfoBatch: jest.fn(),
  createVideoBasicInfo: jest.fn(),
  getUserVideoSetting: jest.fn(),
  upsertUserVideoSetting: jest.fn(),
}));

// モック: @nagiyu/aws (エラー報告)。EntityAlreadyExistsError は instanceof 判定のため実物を使う
jest.mock('@nagiyu/aws', () => ({
  EntityAlreadyExistsError: jest.requireActual('@nagiyu/aws').EntityAlreadyExistsError,
  reportErrorEvent: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '../../../../../../src/app/api/videos/bulk-import/route';
import { EntityAlreadyExistsError, reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '../../../../../../src/lib/auth/session';
import {
  getVideoInfoBatch,
  createVideoBasicInfo,
  getUserVideoSetting,
  upsertUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import type { NiconicoVideoInfo, UserVideoSetting } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetVideoInfoBatch = getVideoInfoBatch as jest.MockedFunction<typeof getVideoInfoBatch>;
const mockCreateVideoBasicInfo = createVideoBasicInfo as jest.MockedFunction<
  typeof createVideoBasicInfo
>;
const mockGetUserVideoSetting = getUserVideoSetting as jest.MockedFunction<
  typeof getUserVideoSetting
>;
const mockUpsertUserVideoSetting = upsertUserVideoSetting as jest.MockedFunction<
  typeof upsertUserVideoSetting
>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { id: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

/** JSON ボディ付き NextRequest を生成するヘルパー */
function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos/bulk-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeVideoInfo(videoId: string): NiconicoVideoInfo {
  return {
    videoId,
    title: `動画 ${videoId}`,
    description: 'desc',
    thumbnailUrl: `https://example.com/${videoId}.jpg`,
    duration: 180,
    viewCount: 0,
    commentCount: 0,
    mylistCount: 0,
    uploadedAt: '2024-01-01T00:00:00+09:00',
    tags: [],
  };
}

function makeVideoBasicInfo(
  videoId: string
): import('@nagiyu/niconico-mylist-assistant-core').VideoBasicInfo {
  return {
    videoId,
    title: `動画 ${videoId}`,
    thumbnailUrl: `https://example.com/${videoId}.jpg`,
    length: '3:00',
    createdAt: 1700000000000,
  };
}

function makeUserVideoSetting(videoId: string): UserVideoSetting {
  return {
    userId: 'user123',
    videoId,
    isFavorite: false,
    isSkip: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

/** 本文の文字列をそのまま持つ NextRequest を生成するヘルパー */
function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/videos/bulk-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/videos/bulk-import', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = makePostRequest({ videoIds: ['sm9', 'sm10'] });
    const response = await POST(request);
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error).toBe('認証が必要です');
    // 認証チェックで弾かれるため、ニコニコAPI呼び出しは発生しない
    expect(mockGetVideoInfoBatch).not.toHaveBeenCalled();
  });

  it('videoIds が配列でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makePostRequest({ videoIds: 'not-an-array' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('videoIds は配列である必要があります');
  });

  it('videoIds が空配列の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makePostRequest({ videoIds: [] });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('videoIds を指定してください');
  });

  it('videoIds が100件を超える場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const videoIds = Array.from({ length: 101 }, (_, i) => `sm${i + 1}`);
    const request = makePostRequest({ videoIds });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('一度に登録できる動画は最大 100 件です');
  });

  it('不正な動画ID形式が含まれる場合は 400 を返し invalidIds を含める', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makePostRequest({ videoIds: ['invalid-id', 'sm9'] });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('不正な動画 ID 形式が含まれています');
    expect(json.invalidIds).toEqual(['invalid-id']);
  });

  it('標準・任意の英字接頭辞を持つ動画IDを受理し、getVideoInfoBatch まで到達する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({ success: [], failed: [] });

    const videoIds = ['sm9', 'so12345', 'nm98765', 'abc123'];
    const request = makePostRequest({ videoIds });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.total).toBe(4);

    // フォーマット検証を通過し、4件すべてが getVideoInfoBatch に渡された
    expect(mockGetVideoInfoBatch).toHaveBeenCalledWith(videoIds);
  });

  it('既にユーザー設定がある動画はスキップされ、getVideoInfoBatch に渡されない', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockImplementation(async (_userId: string, videoId: string) =>
      videoId === 'sm1' ? makeUserVideoSetting('sm1') : null
    );
    mockGetVideoInfoBatch.mockResolvedValue({ success: [makeVideoInfo('sm2')], failed: [] });
    mockCreateVideoBasicInfo.mockResolvedValue(makeVideoBasicInfo('sm2'));
    mockUpsertUserVideoSetting.mockResolvedValue(makeUserVideoSetting('sm2'));

    const request = makePostRequest({ videoIds: ['sm1', 'sm2'] });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.skipped).toBe(1);
    expect(json.success).toBe(1);
    expect(mockGetVideoInfoBatch).toHaveBeenCalledWith(['sm2']);
  });

  it('同じ動画IDが重複しても 1 回だけ扱い、success と total は重複を除いた件数になる', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({ success: [makeVideoInfo('sm1')], failed: [] });
    mockCreateVideoBasicInfo.mockResolvedValue(makeVideoBasicInfo('sm1'));
    mockUpsertUserVideoSetting.mockResolvedValue(makeUserVideoSetting('sm1'));

    const response = await POST(makePostRequest({ videoIds: ['sm1', 'sm1'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(1);
    expect(json.total).toBe(1);
    expect(mockGetUserVideoSetting).toHaveBeenCalledTimes(1);
    expect(mockGetUserVideoSetting).toHaveBeenCalledWith('user123', 'sm1');
    expect(mockGetVideoInfoBatch).toHaveBeenCalledWith(['sm1']);
  });

  it('重複を除く際に元の順序を保つ', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({ success: [], failed: [] });

    const response = await POST(makePostRequest({ videoIds: ['sm3', 'sm1', 'sm3', 'sm2', 'sm1'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.total).toBe(3);
    expect(mockGetVideoInfoBatch).toHaveBeenCalledWith(['sm3', 'sm1', 'sm2']);
  });

  it('既にユーザー設定がある動画IDが重複した場合は 1 件だけスキップに数える', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(makeUserVideoSetting('sm1'));
    mockGetVideoInfoBatch.mockResolvedValue({ success: [], failed: [] });

    const response = await POST(makePostRequest({ videoIds: ['sm1', 'sm1'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.skipped).toBe(1);
    expect(json.success).toBe(0);
    expect(json.total).toBe(1);
    expect(mockGetUserVideoSetting).toHaveBeenCalledTimes(1);
  });

  it('動画情報の取得とDB保存に成功した場合、success カウントが返る', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({
      success: [makeVideoInfo('sm1'), makeVideoInfo('sm2')],
      failed: [],
    });
    mockCreateVideoBasicInfo.mockImplementation(async (input) => makeVideoBasicInfo(input.videoId));
    mockUpsertUserVideoSetting.mockImplementation(async (input) =>
      makeUserVideoSetting(input.videoId)
    );

    const request = makePostRequest({ videoIds: ['sm1', 'sm2'] });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(2);
    expect(json.failed).toBe(0);
    expect(json.skipped).toBe(0);
    expect(json.total).toBe(2);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('既に存在する動画基本情報の作成失敗は想定内なので報告しない', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({ success: [makeVideoInfo('sm1')], failed: [] });
    mockCreateVideoBasicInfo.mockRejectedValue(new EntityAlreadyExistsError('VIDEO', 'sm1'));
    mockUpsertUserVideoSetting.mockImplementation(async (input) =>
      makeUserVideoSetting(input.videoId)
    );

    const response = await POST(makePostRequest({ videoIds: ['sm1'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(1);
    expect(reportErrorEvent).not.toHaveBeenCalled();
  });

  it('既存以外の動画基本情報の作成失敗は失敗件数に数える', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({ success: [makeVideoInfo('sm1')], failed: [] });
    // メッセージに ConditionalCheckFailed を含んでも、既存衝突のエラー型でなければ握りつぶさない
    mockCreateVideoBasicInfo.mockRejectedValue(new Error('ConditionalCheckFailedException'));

    const response = await POST(makePostRequest({ videoIds: ['sm1'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(0);
    expect(mockUpsertUserVideoSetting).not.toHaveBeenCalled();
  });

  it('DB 保存に失敗した動画は失敗件数に数えて 200 を返し、失敗ごとに報告する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockGetVideoInfoBatch.mockResolvedValue({
      success: [makeVideoInfo('sm1'), makeVideoInfo('sm2')],
      failed: [],
    });
    mockCreateVideoBasicInfo.mockImplementation(async (input) => makeVideoBasicInfo(input.videoId));
    mockUpsertUserVideoSetting.mockImplementation(async (input) => {
      if (input.videoId === 'sm2') {
        throw new Error('DB 書き込み失敗');
      }
      return makeUserVideoSetting(input.videoId);
    });

    const response = await POST(makePostRequest({ videoIds: ['sm1', 'sm2'] }));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(1);
    expect(json.failed).toBe(1);
    expect(reportErrorEvent).toHaveBeenCalledTimes(1);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'niconico-mylist-assistant',
        title: 'Web API: 動画一括登録の保存エラー',
        message: 'DB 書き込み失敗',
        context: expect.objectContaining({ userId: 'user123', videoId: 'sm2' }),
      })
    );
  });

  it('想定外の例外は 500 を返し、ラッパーが 1 回だけ報告する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetUserVideoSetting.mockRejectedValue(new Error('DB 接続失敗'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(makePostRequest({ videoIds: ['sm1'] }));
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('サーバーエラーが発生しました');
    expect(reportErrorEvent).toHaveBeenCalledTimes(1);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Web API: 動画一括登録エラー' })
    );
  });
});

describe('POST /api/videos/bulk-import の不正なリクエストボディ', () => {
  it.each([
    ['壊れた JSON', 'this is not json{'],
    ['空の本文', ''],
    ['null', 'null'],
    ['配列', '["sm1"]'],
    ['文字列', '"sm1"'],
  ])('本文が %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makeRawRequest(rawBody));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('リクエストボディが不正です');
    expect(mockGetUserVideoSetting).not.toHaveBeenCalled();
    expect(mockGetVideoInfoBatch).not.toHaveBeenCalled();
  });

  it.each([
    ['配列の要素', [['sm1']]],
    ['数値', [123]],
    ['null', [null]],
    ['オブジェクト', [{ id: 'sm1' }]],
  ])('videoIds に文字列以外（%s）が含まれる場合は 400 を返し、下流を呼ばない', async (_l, ids) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await POST(makePostRequest({ videoIds: ['sm9', ...ids] }));
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('不正な動画 ID 形式が含まれています');
    expect(json.invalidIds).toEqual(ids);
    expect(mockGetUserVideoSetting).not.toHaveBeenCalled();
    expect(mockGetVideoInfoBatch).not.toHaveBeenCalled();
  });
});
