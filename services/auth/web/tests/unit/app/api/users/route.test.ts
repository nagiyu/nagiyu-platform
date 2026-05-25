/**
 * Unit tests for GET /api/users endpoint
 *
 * NOTE: このテストは jest.config.ts の testPathIgnorePatterns により
 * 自動テストランナーから除外されています（既存の規約に従い）。
 */

import { GET } from '../../../../../src/app/api/users/route';

const mockListUsers = jest.fn();
const mockReportErrorEvent = jest.fn().mockResolvedValue(null);
const mockHasPermission = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@nagiyu/auth-core', () => ({
  createUserRepository: jest.fn().mockReturnValue({ listUsers: mockListUsers }),
}));

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: mockReportErrorEvent,
}));

jest.mock('@nagiyu/common', () => ({
  ...jest.requireActual('@nagiyu/common'),
  COMMON_ERROR_MESSAGES: {
    UNAUTHORIZED: '認証が必要です',
    FORBIDDEN: 'この操作を実行する権限がありません',
    INVALID_REQUEST_PARAMS: 'クエリパラメータが不正です',
  },
  hasPermission: mockHasPermission,
}));

jest.mock('../../../../../src/lib/auth/session', () => ({
  getSession: mockGetSession,
}));

describe('GET /api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReportErrorEvent.mockResolvedValue(null);
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
