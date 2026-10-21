/**
 * Unit tests for GET /api/users/me endpoint
 *
 * @jest-environment node
 */

import { GET } from '../../../../../src/app/api/users/me/route';

const mockGetSession = jest.fn();
const mockGetUserById = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

// jest.mock は import より前に巻き上げられるため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  })),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

describe('GET /api/users/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ user: { id: 'user-123', roles: [] } });
  });

  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('自分のユーザー情報を取得できる', async () => {
    const user = { userId: 'user-123', name: 'テスト' };
    mockGetUserById.mockResolvedValue(user);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(mockGetUserById).toHaveBeenCalledWith('user-123');
  });

  it('ユーザーが存在しない場合は 404 を返す', async () => {
    mockGetUserById.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
  });

  it('リポジトリでエラーが起きた場合は 500 を返しエラーイベントを送る', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetUserById.mockRejectedValue(new Error('DB error'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'ユーザー情報の取得に失敗しました' });
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'auth',
        title: 'Web API: 自分のユーザー情報取得エラー',
        message: 'DB error',
      })
    );
  });
});
