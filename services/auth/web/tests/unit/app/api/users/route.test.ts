/**
 * Unit tests for GET /api/users endpoint
 *
 * NOTE: このテストは jest.config.ts の testPathIgnorePatterns により
 * 自動テストランナーから除外されています（既存の規約に従い）。
 * 個別に実行する場合は --testPathIgnorePatterns /node_modules/ を指定する。
 *
 * @jest-environment node
 */

import { GET } from '../../../../../src/app/api/users/route';

const mockListUsers = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);
const mockHasPermission = jest.fn();
const mockGetSession = jest.fn();

// import が jest.mock より後に評価されるため、モック関数は呼び出し時に参照して初期化前アクセスを避ける
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

const encodeKey = (key: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(key)).toString('base64');

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
      mockListUsers.mockResolvedValue({ users: [{ userId: 'u1' }], lastEvaluatedKey: undefined });
    });

    it('クエリ未指定の場合は limit=50 で先頭から取得する', async () => {
      const response = await GET(createRequest());

      expect(response.status).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith(50, undefined);
      expect(await response.json()).toEqual({
        users: [{ userId: 'u1' }],
        pagination: { count: 1 },
      });
    });

    it('lastKey をデコードして listUsers へ渡す', async () => {
      const key = { userId: 'u0' };

      await GET(createRequest(`?limit=10&lastKey=${encodeURIComponent(encodeKey(key))}`));

      expect(mockListUsers).toHaveBeenCalledWith(10, key);
    });

    it('不正な lastKey は 400 にせず無視して先頭から取得する', async () => {
      const response = await GET(createRequest('?lastKey=invalid-base64'));

      expect(response.status).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith(50, undefined);
    });

    it('listUsers の lastEvaluatedKey をエンコードして pagination.lastKey に返す', async () => {
      const key = { userId: 'u1' };
      mockListUsers.mockResolvedValueOnce({ users: [{ userId: 'u1' }], lastEvaluatedKey: key });

      const response = await GET(createRequest());
      const body = await response.json();

      expect(body.pagination).toEqual({ count: 1, lastKey: encodeKey(key) });
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
