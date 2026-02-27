jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { auth } from '../../../../auth';
import { createUnauthorizedResponse, getSessionOrUnauthorized } from '@/lib/auth/session';

jest.mock('../../../../auth', () => ({
  auth: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('session helper', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('未認証レスポンスを401で返す', async () => {
    const response = createUnauthorizedResponse();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: '認証が必要です',
      },
    });
  });

  it('セッションなしの場合は401レスポンスを返す', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getSessionOrUnauthorized();

    expect('status' in result).toBe(true);
    if ('status' in result) {
      expect(result.status).toBe(401);
    }
  });

  it('セッションありの場合はセッションを返す', async () => {
    const session = { user: { id: 'user-1' } } as Awaited<ReturnType<typeof auth>>;
    mockAuth.mockResolvedValue(session);

    const result = await getSessionOrUnauthorized();

    expect('user' in result).toBe(true);
    if ('user' in result) {
      expect(result.user.id).toBe('user-1');
    }
  });
});
