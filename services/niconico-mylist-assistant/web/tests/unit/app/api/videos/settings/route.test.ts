/**
 * @jest-environment node
 */

/**
 * PUT /api/videos/[id]/settings のユニットテスト
 *
 * 認証・動画/設定のリポジトリをモック化して、ボディの検証と更新内容の絞り込みを検証する。
 */

// モック：next-auth セッション
jest.mock('../../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（DB 操作）
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  createUserVideoSetting: jest.fn(),
  getVideoBasicInfo: jest.fn(),
  getUserVideoSetting: jest.fn(),
  updateUserVideoSetting: jest.fn(),
}));

// モック: @nagiyu/aws (エラー報告)
jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { PUT } from '../../../../../../src/app/api/videos/[id]/settings/route';
import { reportErrorEvent } from '@nagiyu/aws';
import { getSession } from '../../../../../../src/lib/auth/session';
import {
  createUserVideoSetting,
  getVideoBasicInfo,
  getUserVideoSetting,
  updateUserVideoSetting,
} from '@nagiyu/niconico-mylist-assistant-core';
import type { UserVideoSetting, VideoBasicInfo } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockCreateUserVideoSetting = createUserVideoSetting as jest.MockedFunction<
  typeof createUserVideoSetting
>;
const mockGetVideoBasicInfo = getVideoBasicInfo as jest.MockedFunction<typeof getVideoBasicInfo>;
const mockGetUserVideoSetting = getUserVideoSetting as jest.MockedFunction<
  typeof getUserVideoSetting
>;
const mockUpdateUserVideoSetting = updateUserVideoSetting as jest.MockedFunction<
  typeof updateUserVideoSetting
>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { id: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const BASIC_INFO: VideoBasicInfo = {
  videoId: 'sm1',
  title: '動画 sm1',
  thumbnailUrl: 'https://example.com/sm1.jpg',
  length: '3:00',
  CreatedAt: 1700000000000,
};

const SETTING: UserVideoSetting = {
  userId: 'user123',
  videoId: 'sm1',
  isFavorite: true,
  isSkip: false,
  memo: 'メモ',
  CreatedAt: 1700000000000,
  UpdatedAt: 1700000001000,
};

/** 本文の文字列をそのまま持つ NextRequest を生成するヘルパー */
function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/videos/sm1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

/** JSON ボディ付き NextRequest を生成するヘルパー */
function makePutRequest(body: unknown): NextRequest {
  return makeRawRequest(JSON.stringify(body));
}

const ROUTE_PARAMS = { params: Promise.resolve({ id: 'sm1' }) };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PUT /api/videos/[id]/settings', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await PUT(makePutRequest({ isFavorite: true }), ROUTE_PARAMS);
    expect(response.status).toBe(401);
    expect(mockUpdateUserVideoSetting).not.toHaveBeenCalled();
  });

  it('動画が存在しない場合は 404 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(null);
    mockGetUserVideoSetting.mockResolvedValue(null);

    const response = await PUT(makePutRequest({ isFavorite: true }), ROUTE_PARAMS);
    expect(response.status).toBe(404);
    expect(mockCreateUserVideoSetting).not.toHaveBeenCalled();
  });

  it('設定が既にある場合は指定した項目だけで更新する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(BASIC_INFO);
    mockGetUserVideoSetting.mockResolvedValue(SETTING);
    mockUpdateUserVideoSetting.mockResolvedValue(SETTING);

    const response = await PUT(
      makePutRequest({ isFavorite: true, memo: 'メモ', userId: 'other', CreatedAt: 1 }),
      ROUTE_PARAMS
    );
    expect(response.status).toBe(200);

    // 想定外の項目 (userId・CreatedAt) は更新内容に含めない
    expect(mockUpdateUserVideoSetting).toHaveBeenCalledWith('user123', 'sm1', {
      isFavorite: true,
      isSkip: undefined,
      memo: 'メモ',
    });

    const json = await response.json();
    expect(json.video.videoId).toBe('sm1');
    expect(json.video.userSetting.isFavorite).toBe(true);
  });

  it('設定が未作成の場合は省略した真偽値を false として新規作成する', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(BASIC_INFO);
    mockGetUserVideoSetting.mockResolvedValue(null);
    mockCreateUserVideoSetting.mockResolvedValue(SETTING);

    const response = await PUT(makePutRequest({ memo: 'メモ' }), ROUTE_PARAMS);
    expect(response.status).toBe(200);

    expect(mockCreateUserVideoSetting).toHaveBeenCalledWith({
      userId: 'user123',
      videoId: 'sm1',
      isFavorite: false,
      isSkip: false,
      memo: 'メモ',
    });
    expect(mockUpdateUserVideoSetting).not.toHaveBeenCalled();
  });

  it('memo が 1000 文字を超える場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await PUT(makePutRequest({ memo: 'あ'.repeat(1001) }), ROUTE_PARAMS);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('memo は 1000 文字以内である必要があります');
    expect(mockGetVideoBasicInfo).not.toHaveBeenCalled();
  });

  it('DB 例外時は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockRejectedValue(new Error('DB 接続失敗'));
    mockGetUserVideoSetting.mockResolvedValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await PUT(makePutRequest({ isFavorite: true }), ROUTE_PARAMS);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('サーバーエラーが発生しました');
    expect(reportErrorEvent).toHaveBeenCalledTimes(1);
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'niconico-mylist-assistant',
        title: 'Web API: 動画設定更新エラー',
        message: 'DB 接続失敗',
      })
    );
  });

  it.each([
    ['壊れた JSON', 'this is not json{'],
    ['空の本文', ''],
    ['null', 'null'],
    ['配列', '[{"isFavorite":true}]'],
  ])('本文が %s の場合は 400 を返し、下流を呼ばない', async (_label, rawBody) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await PUT(makeRawRequest(rawBody), ROUTE_PARAMS);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('リクエストボディが不正です');
    expect(mockGetVideoBasicInfo).not.toHaveBeenCalled();
    expect(mockGetUserVideoSetting).not.toHaveBeenCalled();
    expect(mockUpdateUserVideoSetting).not.toHaveBeenCalled();
    expect(mockCreateUserVideoSetting).not.toHaveBeenCalled();
  });

  it.each([
    ['isFavorite が文字列', { isFavorite: 'true' }, 'isFavorite は真偽値である必要があります'],
    ['isFavorite が null', { isFavorite: null }, 'isFavorite は真偽値である必要があります'],
    ['isSkip が数値', { isSkip: 1 }, 'isSkip は真偽値である必要があります'],
    ['memo が数値', { memo: 123 }, 'memo は文字列である必要があります'],
    ['memo が配列', { memo: ['a'] }, 'memo は文字列である必要があります'],
  ])('%s の場合は 400 を返し、下流を呼ばない', async (_label, body, message) => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const response = await PUT(makePutRequest(body), ROUTE_PARAMS);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe(message);
    expect(mockGetVideoBasicInfo).not.toHaveBeenCalled();
    expect(mockUpdateUserVideoSetting).not.toHaveBeenCalled();
    expect(mockCreateUserVideoSetting).not.toHaveBeenCalled();
  });
});
