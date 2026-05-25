/**
 * @jest-environment node
 */
import { POST } from '@/app/api/echo/route';
import { ECHO_ERROR_MESSAGES, ECHO_MAX_TEXT_LENGTH } from '@/app/api/echo/constants';
import { getSession } from '@/lib/server/session';
import { getVoicevoxClient } from '@/lib/server/voicevox';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/voicevox', () => ({
  getVoicevoxClient: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetClient = getVoicevoxClient as jest.MockedFunction<typeof getVoicevoxClient>;

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

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

describe('POST /api/echo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証時は 401 を返す', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const response = await POST(buildRequest({ text: 'こんにちは' }));
    expect(response.status).toBe(401);
  });

  it('permission がない場合は 403 を返す', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...validSession,
      user: { ...validSession.user, roles: ['guest'] },
    });
    const response = await POST(buildRequest({ text: 'こんにちは' }));
    expect(response.status).toBe(403);
  });

  describe('認証済み', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(validSession);
    });

    it('JSON でない body は 400 INVALID_REQUEST', async () => {
      const response = await POST(buildRequest('not-json'));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('text フィールドがないと 400 INVALID_REQUEST', async () => {
      const response = await POST(buildRequest({ foo: 'bar' }));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('空白だけの text は 400 EMPTY_TEXT', async () => {
      const response = await POST(buildRequest({ text: '   ' }));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.EMPTY_TEXT);
    });

    it('上限超過の text は 400 TEXT_TOO_LONG', async () => {
      const longText = 'あ'.repeat(ECHO_MAX_TEXT_LENGTH + 1);
      const response = await POST(buildRequest({ text: longText }));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.TEXT_TOO_LONG);
    });

    it('VOICEVOX が成功すれば audio/wav で ArrayBuffer を返す', async () => {
      const audio = new ArrayBuffer(16);
      mockGetClient.mockReturnValueOnce({
        synthesize: jest.fn(async () => audio),
      });
      const response = await POST(buildRequest({ text: '  おはよう  ' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/wav');
      const returned = await response.arrayBuffer();
      expect(returned.byteLength).toBe(16);
    });

    it('VOICEVOX が失敗すると 502 SYNTHESIS_FAILED', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetClient.mockReturnValueOnce({
        synthesize: jest.fn(async () => {
          throw new Error('connection refused');
        }),
      });
      const response = await POST(buildRequest({ text: 'こんにちは' }));
      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.SYNTHESIS_FAILED);
      consoleSpy.mockRestore();
    });

    it('trim 済みのテキストが VOICEVOX に渡される', async () => {
      const synthesize = jest.fn(async () => new ArrayBuffer(8));
      mockGetClient.mockReturnValueOnce({ synthesize });
      await POST(buildRequest({ text: '  hello world  ' }));
      expect(synthesize).toHaveBeenCalledWith('hello world');
    });
  });
});
