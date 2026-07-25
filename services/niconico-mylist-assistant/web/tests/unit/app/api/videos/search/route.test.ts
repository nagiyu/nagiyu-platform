/**
 * @jest-environment node
 */

/**
 * GET /api/videos/search のユニットテスト
 *
 * 認証チェックを、実ニコニコ動画APIを呼ばずに検証する。
 *
 * E2E（tests/e2e/video-search.spec.ts）では SKIP_AUTH_CHECK=true の環境では
 * 未認証状態を再現できず 401 を検証できないため、このユニットテストで代替担保する。
 */

// モック：next-auth セッション
jest.mock('../../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：niconico-mylist-assistant-core（ニコニコAPI呼び出し・DB参照）
jest.mock('@nagiyu/niconico-mylist-assistant-core', () => ({
  searchVideos: jest.fn(),
  batchGetVideoBasicInfo: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from '../../../../../../src/app/api/videos/search/route';
import { getSession } from '../../../../../../src/lib/auth/session';
import { searchVideos, batchGetVideoBasicInfo } from '@nagiyu/niconico-mylist-assistant-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockSearchVideos = searchVideos as jest.MockedFunction<typeof searchVideos>;
const mockBatchGetVideoBasicInfo = batchGetVideoBasicInfo as jest.MockedFunction<
  typeof batchGetVideoBasicInfo
>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { userId: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

function makeGetRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/videos/search${query}`);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/videos/search', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = makeGetRequest('?q=test');
    const response = await GET(request);
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error).toBe('認証が必要です');
    // 認証チェックで弾かれるため、ニコニコAPI呼び出しは発生しない
    expect(mockSearchVideos).not.toHaveBeenCalled();
  });

  it('認証済みの場合は検索結果に isRegistered を付与して返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockSearchVideos.mockResolvedValue([
      {
        videoId: 'sm9',
        title: 'レッツゴー!陰陽師',
        description: 'desc',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 120,
        viewCount: 1,
        commentCount: 1,
        mylistCount: 1,
        uploadedAt: '2007-03-06T00:33:00+09:00',
        tags: [],
      },
    ]);
    mockBatchGetVideoBasicInfo.mockResolvedValue([
      {
        videoId: 'sm9',
        title: 'レッツゴー!陰陽師',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        length: '2:00',
        CreatedAt: 1700000000000,
      },
    ]);

    const request = makeGetRequest('?q=陰陽師');
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.total).toBe(1);
    expect(json.videos[0].isRegistered).toBe(true);
  });
});
