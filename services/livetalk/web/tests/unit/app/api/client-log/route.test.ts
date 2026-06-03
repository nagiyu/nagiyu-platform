/**
 * @jest-environment node
 */
import { POST } from '@/app/api/client-log/route';
import { CLIENT_LOG_ERROR_MESSAGES } from '@/app/api/client-log/constants';
import { getSession } from '@/lib/server/session';
import { reportErrorEvent } from '@nagiyu/aws';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

const validSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/client-log', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await POST(buildRequest({ severity: 'error', title: 'T', message: 'M' }));
    expect(res.status).toBe(401);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('JSON でない body は 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest('invalid-json'));
    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, string>;
    expect(json.message).toBe(CLIENT_LOG_ERROR_MESSAGES.INVALID_REQUEST);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('severity が info のとき 400（クライアントから info は受け付けない）', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'info', title: 'T', message: 'M' }));
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('severity が不正な文字列のとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'debug', title: 'T', message: 'M' }));
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('title が空文字のとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'error', title: '', message: 'M' }));
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('title が長すぎるとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildRequest({ severity: 'error', title: 'a'.repeat(201), message: 'M' })
    );
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('message が空文字のとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'error', title: 'T', message: '' }));
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('message が長すぎるとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildRequest({ severity: 'error', title: 'T', message: 'a'.repeat(1001) })
    );
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('context が配列のとき 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildRequest({ severity: 'error', title: 'T', message: 'M', context: [1, 2] })
    );
    expect(res.status).toBe(400);
    expect(mockReportErrorEvent).not.toHaveBeenCalled();
  });

  it('severity: warning で正常に 204 を返し reportErrorEvent を呼ぶ', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'warning', title: 'T', message: 'M' }));
    expect(res.status).toBe(204);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'livetalk',
        severity: 'warning',
        title: 'T',
        message: 'M',
        context: expect.objectContaining({ userId: 'g1' }),
      })
    );
  });

  it('severity: error で 204', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'error', title: 'T', message: 'M' }));
    expect(res.status).toBe(204);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' })
    );
  });

  it('severity: critical で 204', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildRequest({ severity: 'critical', title: 'T', message: 'M' }));
    expect(res.status).toBe(204);
  });

  it('context が渡されたとき userId と一緒に reportErrorEvent に渡される', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildRequest({
        severity: 'error',
        title: 'T',
        message: 'M',
        context: { screen: 'chat', audioContextState: 'suspended' },
      })
    );
    expect(res.status).toBe(204);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          userId: 'g1',
          screen: 'chat',
          audioContextState: 'suspended',
        },
      })
    );
  });

  it('occurredAt が渡されたとき reportErrorEvent に渡される', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const occurredAt = '2026-06-03T00:00:00.000Z';
    const res = await POST(
      buildRequest({ severity: 'error', title: 'T', message: 'M', occurredAt })
    );
    expect(res.status).toBe(204);
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt })
    );
  });

  it('reportErrorEvent が失敗（null 返却）しても 204 を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockReportErrorEvent.mockResolvedValueOnce(null);
    const res = await POST(buildRequest({ severity: 'error', title: 'T', message: 'M' }));
    expect(res.status).toBe(204);
  });
});
