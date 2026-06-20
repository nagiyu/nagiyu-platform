/**
 * @jest-environment node
 */

/**
 * GET/POST/DELETE /api/niconico/session のユニットテスト
 *
 * セッション認証・リポジトリ・暗号化をモック化して API 境界を検証する。
 */

// モック：next-auth セッション
jest.mock('../../../../../../src/lib/auth/session', () => ({
  getSession: jest.fn(),
}));

// モック：ニコニコセッション管理ビジネスロジック
jest.mock('../../../../../../src/lib/niconico-session', () => ({
  getNiconicoSessionStatus: jest.fn(),
  saveNiconicoSession: jest.fn(),
  deleteNiconicoSession: jest.fn(),
  InvalidSessionError: class InvalidSessionError extends Error {
    constructor() {
      super('InvalidSession');
      this.name = 'InvalidSessionError';
    }
  },
  IndeterminateSessionError: class IndeterminateSessionError extends Error {
    constructor() {
      super('IndeterminateSession');
      this.name = 'IndeterminateSessionError';
    }
  },
}));

import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../../../../../../src/app/api/niconico/session/route';
import { getSession } from '../../../../../../src/lib/auth/session';
import {
  getNiconicoSessionStatus,
  saveNiconicoSession,
  deleteNiconicoSession,
  InvalidSessionError,
  IndeterminateSessionError,
} from '../../../../../../src/lib/niconico-session';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetNiconicoSessionStatus = getNiconicoSessionStatus as jest.MockedFunction<
  typeof getNiconicoSessionStatus
>;
const mockSaveNiconicoSession = saveNiconicoSession as jest.MockedFunction<
  typeof saveNiconicoSession
>;
const mockDeleteNiconicoSession = deleteNiconicoSession as jest.MockedFunction<
  typeof deleteNiconicoSession
>;

/** 認証済みセッションのモック */
const MOCK_SESSION = {
  user: { userId: 'user123', email: 'test@example.com', name: 'テストユーザー', roles: [] },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

/** JSON ボディ付き NextRequest を生成するヘルパー */
function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/niconico/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 不正な JSON ボディを持つ NextRequest を生成するヘルパー */
function makeMalformedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/niconico/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not json{',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ----------------------------------------------------------------
// GET /api/niconico/session
// ----------------------------------------------------------------
describe('GET /api/niconico/session', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json.error).toBe('UNAUTHORIZED');
  });

  it('セッション状態を shape 通りに返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetNiconicoSessionStatus.mockResolvedValue({
      hasSession: true,
      validity: 'valid',
      acquiredAt: 1700000000000,
      estimatedExpiresAt: 1702592000000,
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.hasSession).toBe(true);
    expect(json.validity).toBe('valid');
    expect(json.acquiredAt).toBe(1700000000000);
    expect(json.estimatedExpiresAt).toBe(1702592000000);
  });

  it('保存セッションなしの場合は hasSession=false を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetNiconicoSessionStatus.mockResolvedValue({
      hasSession: false,
      validity: undefined,
      acquiredAt: undefined,
      estimatedExpiresAt: undefined,
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.hasSession).toBe(false);
    // undefined はシリアライズで省略されるため、プロパティが存在しないことを確認
    expect('validity' in json ? json.validity : undefined).toBeUndefined();
  });

  it('復号失敗時は hasSession=true, validity=invalid を返す（自己回復）', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    // ビジネスロジック層が自己回復して invalid を返す
    mockGetNiconicoSessionStatus.mockResolvedValue({
      hasSession: true,
      validity: 'invalid',
      acquiredAt: 1700000000000,
      estimatedExpiresAt: 1702592000000,
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.hasSession).toBe(true);
    expect(json.validity).toBe('invalid');
    expect(json.acquiredAt).toBe(1700000000000);
  });

  it('ビジネスロジック例外時は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockGetNiconicoSessionStatus.mockRejectedValue(new Error('DB接続失敗'));

    const response = await GET();
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('SESSION_STATUS_ERROR');
  });
});

// ----------------------------------------------------------------
// POST /api/niconico/session
// ----------------------------------------------------------------
describe('POST /api/niconico/session', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const request = makePostRequest({ userSession: 'some-session' });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('不正 JSON の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makeMalformedRequest();
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST_BODY');
    expect(typeof json.message).toBe('string');
    // メッセージが日本語であることを確認
    expect(json.message).toMatch(/不正|JSON/);
  });

  it('userSession が未指定の場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makePostRequest({});
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('userSession が文字列でない場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);

    const request = makePostRequest({ userSession: 12345 });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_REQUEST');
  });

  it('valid セッションを保存すると 200 と acquiredAt/estimatedExpiresAt を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockSaveNiconicoSession.mockResolvedValue({
      acquiredAt: 1700000000000,
      estimatedExpiresAt: 1702592000000,
    });

    const request = makePostRequest({ userSession: 'valid-session-value' });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.acquiredAt).toBe(1700000000000);
    expect(json.estimatedExpiresAt).toBe(1702592000000);
    expect(typeof json.message).toBe('string');
  });

  it('InvalidSessionError 時は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockSaveNiconicoSession.mockRejectedValue(new InvalidSessionError());

    const request = makePostRequest({ userSession: 'invalid-session' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INVALID_SESSION');
  });

  it('IndeterminateSessionError 時は 400 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockSaveNiconicoSession.mockRejectedValue(new IndeterminateSessionError());

    const request = makePostRequest({ userSession: 'unknown-session' });
    const response = await POST(request);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('INDETERMINATE_SESSION');
  });

  it('予期しない例外時は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockSaveNiconicoSession.mockRejectedValue(new Error('予期しないエラー'));

    const request = makePostRequest({ userSession: 'some-session' });
    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('SESSION_SAVE_ERROR');
  });
});

// ----------------------------------------------------------------
// DELETE /api/niconico/session
// ----------------------------------------------------------------
describe('DELETE /api/niconico/session', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await DELETE();
    expect(response.status).toBe(401);
  });

  it('保存済みセッションを削除して 200 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockDeleteNiconicoSession.mockResolvedValue(undefined);

    const response = await DELETE();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(typeof json.message).toBe('string');
    // deleteNiconicoSession が正しい userId で呼ばれる
    expect(mockDeleteNiconicoSession).toHaveBeenCalledWith('user123');
  });

  it('削除時の例外は 500 を返す', async () => {
    mockGetSession.mockResolvedValue(MOCK_SESSION);
    mockDeleteNiconicoSession.mockRejectedValue(new Error('DB削除失敗'));

    const response = await DELETE();
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('SESSION_DELETE_ERROR');
  });
});
