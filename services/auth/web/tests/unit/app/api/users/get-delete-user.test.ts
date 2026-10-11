/**
 * Unit tests for GET / DELETE /api/users/[userId] endpoint
 *
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { DELETE, GET } from '../../../../../src/app/api/users/[userId]/route';

const mockGetSession = jest.fn();
const mockGetUserById = jest.fn();
const mockDeleteUser = jest.fn();
const mockHasPermission = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);

// jest.mock は import より前に巻き上げられるため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  })),
  UserNotFoundError: class UserNotFoundError extends Error {},
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

const context = { params: Promise.resolve({ userId: 'user-456' }) };

const createRequest = (method: string) =>
  new NextRequest('http://localhost/api/users/user-456', { method });

beforeEach(() => {
  jest.clearAllMocks();
  mockReportErrorEvent.mockResolvedValue(null);
  mockGetSession.mockResolvedValue({ user: { id: 'admin-123', roles: ['admin'] } });
  mockHasPermission.mockReturnValue(true);
});

describe('GET /api/users/[userId]', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(createRequest('GET'), context);

    expect(response.status).toBe(401);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('users:read 権限がない場合は 403 を返す', async () => {
    mockHasPermission.mockReturnValue(false);

    const response = await GET(createRequest('GET'), context);

    expect(response.status).toBe(403);
    expect(mockHasPermission).toHaveBeenCalledWith(['admin'], 'users:read');
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('ユーザーを取得できる', async () => {
    const user = { userId: 'user-456', name: 'テスト' };
    mockGetUserById.mockResolvedValue(user);

    const response = await GET(createRequest('GET'), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(mockGetUserById).toHaveBeenCalledWith('user-456');
  });

  it('ユーザーが存在しない場合は 404 を返す', async () => {
    mockGetUserById.mockResolvedValue(null);

    const response = await GET(createRequest('GET'), context);

    expect(response.status).toBe(404);
  });

  it('リポジトリでエラーが起きた場合は 500 を返しエラーイベントを送る', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetUserById.mockRejectedValue(new Error('DB error'));

    const response = await GET(createRequest('GET'), context);

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'auth', message: 'DB error' })
    );
  });
});

describe('DELETE /api/users/[userId]', () => {
  it('未認証の場合は 401 を返す', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await DELETE(createRequest('DELETE'), context);

    expect(response.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('users:write 権限がない場合は 403 を返す', async () => {
    mockHasPermission.mockReturnValue(false);

    const response = await DELETE(createRequest('DELETE'), context);

    expect(response.status).toBe(403);
    expect(mockHasPermission).toHaveBeenCalledWith(['admin'], 'users:write');
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('自分自身を削除しようとした場合は 400 を返す', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-456', roles: ['admin'] } });

    const response = await DELETE(createRequest('DELETE'), context);

    expect(response.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('ユーザーを削除できる', async () => {
    mockDeleteUser.mockResolvedValue(undefined);

    const response = await DELETE(createRequest('DELETE'), context);

    expect(response.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith('user-456');
  });

  it('リポジトリでエラーが起きた場合は 500 を返しエラーイベントを送る', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDeleteUser.mockRejectedValue(new Error('DB error'));

    const response = await DELETE(createRequest('DELETE'), context);

    expect(response.status).toBe(500);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: 'auth', message: 'DB error' })
    );
  });
});
