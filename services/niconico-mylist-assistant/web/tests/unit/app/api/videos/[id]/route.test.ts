/**
 * @jest-environment node
 */

/**
 * GET /api/videos/[id] のユニットテスト
 *
 * 認証・動画/設定のリポジトリをモック化して、レスポンスの createdAt の出所を検証する。
 */

// モック：next-auth セッション
jest.mock('../../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（DB 操作）
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  getVideoBasicInfo: jest.fn(),
  getUserVideoSetting: jest.fn(),
  deleteUserVideoSetting: jest.fn(),
  deleteVideoBasicInfo: jest.fn(),
}));

// モック: @nagiyu/aws (エラー報告)
jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn(),
  createErrorReporter: jest.fn(() => ({ report: jest.fn(), onError: jest.fn(() => jest.fn()) })),
}));

import { NextRequest } from 'next/server';
import { GET } from '../../../../../../src/app/api/videos/[id]/route';
import { getSession } from '../../../../../../src/lib/auth/session';
import { getVideoBasicInfo, getUserVideoSetting } from '@nagiyu/niconico-mylist-assistant-core';
import type { UserVideoSetting, VideoBasicInfo } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetVideoBasicInfo = getVideoBasicInfo as jest.MockedFunction<typeof getVideoBasicInfo>;
const mockGetUserVideoSetting = getUserVideoSetting as jest.MockedFunction<
  typeof getUserVideoSetting
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
  createdAt: 1700000000000,
};

// 基本情報の登録日と異なる値にして、どちらが返るかを区別できるようにする
const SETTING: UserVideoSetting = {
  userId: 'user123',
  videoId: 'sm1',
  isFavorite: true,
  isSkip: false,
  memo: 'メモ',
  createdAt: 1700000005000,
  updatedAt: 1700000006000,
};

const ROUTE_PARAMS = { params: Promise.resolve({ id: 'sm1' }) };

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/videos/sm1', { method: 'GET' });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/videos/[id]', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), ROUTE_PARAMS);
    expect(response.status).toBe(401);
    expect(mockGetVideoBasicInfo).not.toHaveBeenCalled();
  });

  it('基本情報がない場合は 404 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(null);
    mockGetUserVideoSetting.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), ROUTE_PARAMS);
    expect(response.status).toBe(404);
  });

  it('設定がある場合も createdAt は基本情報の登録日で、userSetting.createdAt は設定の作成日時を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(BASIC_INFO);
    mockGetUserVideoSetting.mockResolvedValue(SETTING);

    const response = await GET(makeGetRequest(), ROUTE_PARAMS);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.video.createdAt).toBe(BASIC_INFO.createdAt);
    expect(json.video.userSetting.createdAt).toBe(SETTING.createdAt);
  });

  it('設定がない場合も createdAt は基本情報の登録日で、userSetting は含まない', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetVideoBasicInfo.mockResolvedValue(BASIC_INFO);
    mockGetUserVideoSetting.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), ROUTE_PARAMS);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.video.createdAt).toBe(BASIC_INFO.createdAt);
    expect(json.video.userSetting).toBeUndefined();
  });
});
