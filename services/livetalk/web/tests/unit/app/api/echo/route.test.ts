/**
 * @jest-environment node
 */
import { POST } from '@/app/api/echo/route';
import { ECHO_ERROR_MESSAGES, ECHO_MAX_TEXT_LENGTH } from '@/app/api/echo/constants';
import { getSession } from '@/lib/server/session';
import { getVoicevoxClient } from '@/lib/server/voicevox';
import { getMessageRepository } from '@/lib/server/repositories';
import type { MessageRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/voicevox', () => ({
  getVoicevoxClient: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getMessageRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetClient = getVoicevoxClient as jest.MockedFunction<typeof getVoicevoxClient>;
const mockGetRepo = getMessageRepository as jest.MockedFunction<typeof getMessageRepository>;

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

const makeRepo = (overrides: Partial<MessageRepository> = {}): MessageRepository => {
  const create: MessageRepository['create'] = jest.fn(async (input) => ({
    UserID: input.UserID,
    CharacterID: input.CharacterID,
    MessageID: 'ULID-X',
    Role: input.Role,
    Text: input.Text,
    CreatedAt: 0,
    UpdatedAt: 0,
  }));
  const getById: MessageRepository['getById'] = jest.fn(async () => null);
  const getRecentByTokenBudget: MessageRepository['getRecentByTokenBudget'] = jest.fn(async () => ({
    messages: [],
    totalTokens: 0,
    truncated: false,
  }));
  return { create, getById, getRecentByTokenBudget, ...overrides };
};

describe('POST /api/echo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepo.mockReturnValue(makeRepo());
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

    it('成功時にユーザー発話とキャラ応答を DynamoDB に保存し、audio/wav で返す', async () => {
      const audio = new ArrayBuffer(16);
      const synthesize = jest.fn(async () => audio);
      mockGetClient.mockReturnValueOnce({ synthesize });
      const repo = makeRepo();
      mockGetRepo.mockReturnValue(repo);

      const response = await POST(buildRequest({ text: '  おはよう  ' }));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/wav');
      const returned = await response.arrayBuffer();
      expect(returned.byteLength).toBe(16);

      // ユーザー発話 → 応答の順で 2 件保存される
      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.create).toHaveBeenNthCalledWith(1, {
        UserID: 'g1',
        CharacterID: 'hiyori',
        Role: 'user',
        Text: 'おはよう',
      });
      expect(repo.create).toHaveBeenNthCalledWith(2, {
        UserID: 'g1',
        CharacterID: 'hiyori',
        Role: 'assistant',
        Text: 'おはよう',
      });
      expect(synthesize).toHaveBeenCalledWith('おはよう');
    });

    it('VOICEVOX が失敗すると 502 SYNTHESIS_FAILED、ユーザー発話は既に保存済み', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const repo = makeRepo();
      mockGetRepo.mockReturnValue(repo);
      mockGetClient.mockReturnValueOnce({
        synthesize: jest.fn(async () => {
          throw new Error('connection refused');
        }),
      });
      const response = await POST(buildRequest({ text: 'こんにちは' }));
      expect(response.status).toBe(502);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.SYNTHESIS_FAILED);
      // user の 1 件のみ。assistant は保存されない（VOICEVOX エラーで応答テキストが
      // 確定できない状況のため）。
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect((repo.create as jest.Mock).mock.calls[0][0].Role).toBe('user');
      consoleSpy.mockRestore();
    });

    it('ユーザー発話の保存に失敗すると 500 PERSISTENCE_FAILED、VOICEVOX は呼ばれない', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const synthesize = jest.fn();
      mockGetClient.mockReturnValueOnce({ synthesize });
      const repo = makeRepo({
        create: jest.fn(async () => {
          throw new Error('dynamodb down');
        }),
      });
      mockGetRepo.mockReturnValue(repo);

      const response = await POST(buildRequest({ text: 'hi' }));
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.PERSISTENCE_FAILED);
      expect(synthesize).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('キャラ応答の保存に失敗すると 500 PERSISTENCE_FAILED', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetClient.mockReturnValueOnce({
        synthesize: jest.fn(async () => new ArrayBuffer(4)),
      });
      let call = 0;
      const createFn = jest.fn(async () => {
        call++;
        if (call === 1) {
          return {
            UserID: 'g1',
            CharacterID: 'hiyori',
            MessageID: 'X',
            Role: 'user' as const,
            Text: 'hi',
            CreatedAt: 0,
            UpdatedAt: 0,
          };
        }
        throw new Error('dynamodb down');
      });
      const repo = makeRepo({ create: createFn });
      mockGetRepo.mockReturnValue(repo);

      const response = await POST(buildRequest({ text: 'hi' }));
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe(ECHO_ERROR_MESSAGES.PERSISTENCE_FAILED);
      consoleSpy.mockRestore();
    });
  });
});
