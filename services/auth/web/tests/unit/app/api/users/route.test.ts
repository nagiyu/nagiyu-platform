/**
 * Unit tests for GET /api/users endpoint
 *
 * @jest-environment node
 */

import { GET } from '../../../../../src/app/api/users/route';

const mockListUsers = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);
const mockHasPermission = jest.fn();
const mockGetSession = jest.fn();

// jest.mock は import より前に巻き上げられ、ファクトリは const の初期化前に実行される。
// そのため、モック関数はファクトリ内で直接参照せず、呼び出し時に参照する
jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn(() => ({
    listUsers: (...args: unknown[]) => mockListUsers(...args),
  })),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  reportErrorEvent: (...args: unknown[]) => mockReportErrorEvent(...args),
}));

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  COMMON_ERROR_MESSAGES: {
    UNAUTHORIZED: '認証が必要です',
    FORBIDDEN: 'この操作を実行する権限がありません',
    INVALID_REQUEST_PARAMS: 'クエリパラメータが不正です',
  },
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: () => mockGetSession(),
}));

const createRequest = (query = ''): Parameters<typeof GET>[0] =>
  new Request(`http://localhost/api/users${query}`) as unknown as Parameters<typeof GET>[0];

describe('GET /api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
  });

  describe('ページネーション', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin', roles: ['admin'] } });
      mockHasPermission.mockReturnValue(true);
      mockListUsers.mockResolvedValue({
        items: [{ userId: 'u1' }],
        nextCursor: undefined,
        count: 1,
      });
    });

    it('クエリ未指定の場合は limit=50 で先頭から取得する', async () => {
      const response = await GET(createRequest());

      expect(response.status).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith({ limit: 50, cursor: undefined });
      expect(await response.json()).toEqual({
        users: [{ userId: 'u1' }],
        pagination: { count: 1 },
      });
    });

    it('lastKey を cursor としてそのまま listUsers へ渡す', async () => {
      await GET(createRequest('?limit=10&lastKey=opaque-cursor'));

      expect(mockListUsers).toHaveBeenCalledWith({ limit: 10, cursor: 'opaque-cursor' });
    });

    it('不正な lastKey でも 400 にせず listUsers へ渡す (無視して先頭から取得するのはリポジトリ側)', async () => {
      const response = await GET(createRequest('?lastKey=invalid-base64'));

      expect(response.status).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith({ limit: 50, cursor: 'invalid-base64' });
    });

    it('listUsers の nextCursor をそのまま pagination.lastKey に返す', async () => {
      mockListUsers.mockResolvedValueOnce({
        items: [{ userId: 'u1' }],
        nextCursor: 'next-cursor',
        count: 1,
      });

      const response = await GET(createRequest());
      const body = await response.json();

      expect(body.pagination).toEqual({ count: 1, lastKey: 'next-cursor' });
    });

    it.each(['0', '101', 'abc'])(
      'limit=%s の場合は 400 を返し listUsers を呼ばない',
      async (limit) => {
        const response = await GET(createRequest(`?limit=${limit}`));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: 'クエリパラメータが不正です',
          details: [{ field: 'limit', message: 'limit は 1 から 100 の間で指定してください' }],
        });
        expect(mockListUsers).not.toHaveBeenCalled();
      }
    );
  });

  describe('エラーパス', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({ user: { id: 'admin', roles: ['admin'] } });
      mockHasPermission.mockReturnValue(true);
    });

    it('DB エラー時は reportErrorEvent を呼び 500 を返す', async () => {
      mockListUsers.mockRejectedValueOnce(new Error('DynamoDB scan failed'));

      const req = new Request('http://localhost/api/users') as unknown as Parameters<typeof GET>[0];
      const response = await GET(req);

      expect(response.status).toBe(500);
      expect(mockReportErrorEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceId: 'auth',
          severity: 'error',
          title: 'Web API: ユーザー一覧取得エラー',
          message: 'DynamoDB scan failed',
        })
      );
      const call = mockReportErrorEvent.mock.calls[0][0];
      expect(JSON.stringify(call.context)).not.toContain('email');
      expect(JSON.stringify(call.context)).not.toContain('googleId');
    });
  });
});
