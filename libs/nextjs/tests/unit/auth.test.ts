/**
 * Auth Helper Unit Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getAuthError, getSessionOrThrow, getOptionalSession, withAuth } from '../../src/auth';
import { NextRequest, NextResponse } from 'next/server';
import type { Session } from '@nagiyu/common';

// Mock next-auth
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

describe('getAuthError', () => {
  it('セッションがnullの場合、401エラーを返す', () => {
    const error = getAuthError(null, 'stocks:read');
    expect(error).toEqual({
      message: 'ログインが必要です',
      statusCode: 401,
    });
  });

  it('権限がない場合、403エラーを返す', () => {
    const session: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };
    const error = getAuthError(session, 'stocks:manage-data');
    expect(error).toEqual({
      message: 'この操作を実行する権限がありません',
      statusCode: 403,
    });
  });

  it('権限がある場合、nullを返す', () => {
    const session: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-admin'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };
    const error = getAuthError(session, 'stocks:manage-data');
    expect(error).toBeNull();
  });

  it('stocks:readの権限がある場合、nullを返す', () => {
    const session: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };
    const error = getAuthError(session, 'stocks:read');
    expect(error).toBeNull();
  });

  it('stocks:write-ownの権限がある場合、nullを返す', () => {
    const session: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };
    const error = getAuthError(session, 'stocks:write-own');
    expect(error).toBeNull();
  });
});

describe('getSessionOrThrow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('セッションがある場合、セッションを返す', async () => {
    const mockSession: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };

    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      mockSession as never
    );

    const session = await getSessionOrThrow();
    expect(session).toEqual(mockSession);
  });

  it('セッションがない場合、エラーをスローする', async () => {
    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      null as never
    );

    await expect(getSessionOrThrow()).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('getOptionalSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('セッションがある場合、セッションを返す', async () => {
    const mockSession: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };

    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      mockSession as never
    );

    const session = await getOptionalSession();
    expect(session).toEqual(mockSession);
  });

  it('セッションがない場合、nullを返す', async () => {
    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      null as never
    );

    const session = await getOptionalSession();
    expect(session).toBeNull();
  });
});

describe('withAuth', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('認証済みユーザーの場合、ハンドラーを実行する', async () => {
    const mockSession: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };

    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      mockSession as never
    );

    const handler = jest.fn<(session: Session, request: NextRequest) => Promise<NextResponse>>(
      async (session: Session) => {
        return NextResponse.json({ success: true });
      }
    );

    const wrappedHandler = withAuth('stocks:read', handler);
    const request = new NextRequest('http://localhost/api/test');
    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('未認証の場合、401エラーを返す', async () => {
    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      null as never
    );

    const handler = jest.fn<(session: Session, request: NextRequest) => Promise<NextResponse>>();
    const wrappedHandler = withAuth('stocks:read', handler);
    const request = new NextRequest('http://localhost/api/test');
    const response = await wrappedHandler(request);

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('権限がない場合、403エラーを返す', async () => {
    const mockSession: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };

    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      mockSession as never
    );

    const handler = jest.fn<(session: Session, request: NextRequest) => Promise<NextResponse>>();
    const wrappedHandler = withAuth('stocks:manage-data', handler);
    const request = new NextRequest('http://localhost/api/test');
    const response = await wrappedHandler(request);

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it('ハンドラーでエラーが発生した場合、500エラーを返す', async () => {
    const mockSession: Session = {
      user: {
        userId: 'user-1',
        googleId: 'google-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['stock-user'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      expires: '2024-12-31T23:59:59Z',
    };

    const { getServerSession } = await import('next-auth/next');
    (getServerSession as jest.MockedFunction<typeof getServerSession>).mockResolvedValue(
      mockSession as never
    );

    const handler = jest
      .fn<(session: Session, request: NextRequest) => Promise<NextResponse>>()
      .mockRejectedValue(new Error('Handler error'));
    const wrappedHandler = withAuth('stocks:read', handler);
    const request = new NextRequest('http://localhost/api/test');
    const response = await wrappedHandler(request);

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
