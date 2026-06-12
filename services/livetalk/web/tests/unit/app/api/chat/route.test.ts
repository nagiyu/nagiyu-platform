/**
 * @jest-environment node
 */
import { POST } from '@/app/api/chat/route';
import { CHAT_ERROR_MESSAGES, CHAT_MAX_TEXT_LENGTH } from '@/app/api/chat/constants';
import { getSession } from '@/lib/server/session';
import { getLLMClient } from '@/lib/server/llm';
import { getVoiceClient } from '@/lib/server/voice';
import { getMessageRepository, getChatGuardRepository } from '@/lib/server/repositories';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/llm', () => ({ getLLMClient: jest.fn() }));
jest.mock('@/lib/server/voice', () => ({ getVoiceClient: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({
  getMessageRepository: jest.fn(),
  getMemoryRepository: jest.fn().mockReturnValue({}),
  getMemorySummaryRepository: jest.fn().mockReturnValue({}),
  getCharacterStateRepository: jest.fn().mockReturnValue({}),
  getLifecycleRepository: jest.fn().mockReturnValue({}),
  getKnowledgeRepository: jest.fn().mockReturnValue({}),
  getStudyTopicRepository: jest.fn().mockReturnValue({}),
  getNoteRepository: jest.fn().mockReturnValue({}),
  getChatGuardRepository: jest.fn(),
}));
jest.mock('@/lib/server/safety', () => ({
  getSafetyEventRepository: jest.fn().mockReturnValue({}),
  getModerationClient: jest.fn().mockReturnValue({}),
}));
jest.mock('@/lib/server/memory-retriever', () => ({
  getMemoryRetriever: jest.fn().mockReturnValue({}),
}));
jest.mock('@/lib/server/embedding', () => ({
  getEmbeddingClient: jest.fn().mockReturnValue({}),
}));

// runChatUseCase をモック化して依存 I/O を切り離す
jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  runChatUseCase: jest.fn(),
}));

import { runChatUseCase } from '@nagiyu/livetalk-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockRunChatUseCase = runChatUseCase as jest.Mock;
const mockGetChatGuardRepository = getChatGuardRepository as jest.Mock;

/** デフォルトのガードモック（全て通過させる） */
const makeDefaultGuardMock = () => ({
  incrementRateLimit: jest.fn().mockResolvedValue({ count: 1, window: '1m' }),
  acquireLock: jest.fn().mockResolvedValue({ acquired: true, ownerToken: 'test-token' }),
  releaseLock: jest.fn().mockResolvedValue(undefined),
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

const buildRequest = (body: unknown): Request =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function readNDJSONStream(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunChatUseCase.mockImplementation(async function* () {
      yield { type: 'text', delta: 'こんにちは' };
      yield { type: 'done' };
    });
    (getLLMClient as jest.Mock).mockReturnValue({});
    (getVoiceClient as jest.Mock).mockReturnValue({});
    (getMessageRepository as jest.Mock).mockReturnValue({});
    mockGetChatGuardRepository.mockReturnValue(makeDefaultGuardMock());
  });

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await POST(buildRequest({ text: 'hello' }));
    expect(res.status).toBe(401);
  });

  it('permission がない場合は 403', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...validSession,
      user: { ...validSession.user, roles: ['guest'] },
    });
    const res = await POST(buildRequest({ text: 'hello' }));
    expect(res.status).toBe(403);
  });

  describe('認証済み', () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(validSession);
    });

    it('JSON でない body は 400 INVALID_REQUEST', async () => {
      const res = await POST(buildRequest('not-json'));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('text フィールドがない場合は 400 INVALID_REQUEST', async () => {
      const res = await POST(buildRequest({ foo: 'bar' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('空白のみの text は 400 EMPTY_TEXT', async () => {
      const res = await POST(buildRequest({ text: '   ' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.EMPTY_TEXT);
    });

    it('上限超過の text は 400 TEXT_TOO_LONG', async () => {
      const longText = 'あ'.repeat(CHAT_MAX_TEXT_LENGTH + 1);
      const res = await POST(buildRequest({ text: longText }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.TEXT_TOO_LONG);
    });

    it('成功時は 200 application/x-ndjson を返す', async () => {
      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
    });

    it('NDJSON ストリームに text/done events が含まれる', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'text', delta: 'お' };
        yield { type: 'text', delta: 'は' };
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      const events = await readNDJSONStream(res);

      expect(events).toEqual([
        { type: 'text', delta: 'お' },
        { type: 'text', delta: 'は' },
        { type: 'done' },
      ]);
    });

    it('sentence event も NDJSON に含まれる', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'text', delta: 'こんにちは。' };
        yield { type: 'sentence', index: 0, text: 'こんにちは。', audio: 'base64abc' };
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'hi' }));
      const events = await readNDJSONStream(res);

      expect(events[1]).toEqual({
        type: 'sentence',
        index: 0,
        text: 'こんにちは。',
        audio: 'base64abc',
      });
    });

    it('runChatUseCase がエラーをスローした場合は error event を emit して終了する', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRunChatUseCase.mockImplementation(async function* () {
        throw new Error('usecase error');
        yield { type: 'done' as const };
      });

      const res = await POST(buildRequest({ text: 'hello' }));
      expect(res.status).toBe(200);
      const events = await readNDJSONStream(res);
      expect(events[0]).toMatchObject({ type: 'error' });
    });

    it('runChatUseCase に userId と userText が渡される', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      await POST(buildRequest({ text: '  テスト  ' }));

      expect(mockRunChatUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'g1', userText: 'テスト' })
      );
    });

    it('knowledgeId を含むリクエストは notificationKnowledgeId として usecase に渡される', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      await POST(buildRequest({ text: 'こんにちは', knowledgeId: 'k-abc' }));

      expect(mockRunChatUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ notificationKnowledgeId: 'k-abc' })
      );
    });

    it('knowledgeId が空文字列のときは notificationKnowledgeId が undefined になる', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      await POST(buildRequest({ text: 'こんにちは', knowledgeId: '' }));

      expect(mockRunChatUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ notificationKnowledgeId: undefined })
      );
    });

    it('knowledgeId が数値型のリクエストは 400 INVALID_REQUEST', async () => {
      const res = await POST(buildRequest({ text: 'hello', knowledgeId: 123 }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('characterId を省略した場合は DEFAULT_CHARACTER_ID で動作する', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(200);

      // runChatUseCase に characterId と character が渡されていることを確認する
      expect(mockRunChatUseCase).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: 'hiyori',
          character: expect.objectContaining({ id: 'hiyori' }),
        })
      );
    });

    it('characterId に登録済みの "hiyori" を指定した場合は正常に動作する', async () => {
      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'こんにちは', characterId: 'hiyori' }));
      expect(res.status).toBe(200);

      expect(mockRunChatUseCase).toHaveBeenCalledWith(
        expect.objectContaining({ characterId: 'hiyori' })
      );
    });

    it('未登録の characterId を指定した場合は 400 INVALID_REQUEST を返す', async () => {
      const res = await POST(buildRequest({ text: 'こんにちは', characterId: 'unknown' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('characterId が数値型のリクエストは 400 INVALID_REQUEST', async () => {
      const res = await POST(buildRequest({ text: 'hello', characterId: 123 }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.INVALID_REQUEST);
    });

    // ---- ガード: レートリミット ----

    it('1 分ウィンドウ超過（count > 10）は 429 RATE_LIMIT_EXCEEDED を返す', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.incrementRateLimit
        .mockResolvedValueOnce({ count: 11, window: '1m' })
        .mockResolvedValueOnce({ count: 1, window: '1h' });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });

    it('1 時間ウィンドウ超過（count > 100）は 429 RATE_LIMIT_EXCEEDED を返す', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.incrementRateLimit
        .mockResolvedValueOnce({ count: 1, window: '1m' })
        .mockResolvedValueOnce({ count: 101, window: '1h' });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
    });

    it('レートリミット上限ちょうど（count=10）は通過する', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.incrementRateLimit
        .mockResolvedValueOnce({ count: 10, window: '1m' })
        .mockResolvedValueOnce({ count: 10, window: '1h' });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(200);
    });

    it('レートリミット超過時はストリームを開始しない（ロックも取得しない）', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.incrementRateLimit
        .mockResolvedValueOnce({ count: 11, window: '1m' })
        .mockResolvedValueOnce({ count: 1, window: '1h' });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      await POST(buildRequest({ text: 'こんにちは' }));
      expect(guardMock.acquireLock).not.toHaveBeenCalled();
      expect(mockRunChatUseCase).not.toHaveBeenCalled();
    });

    // ---- ガード: 並行制御 ----

    it('ロック取得失敗（acquired=false）は 429 CONCURRENT_REQUEST を返す', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.acquireLock.mockResolvedValue({ acquired: false });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.message).toBe(CHAT_ERROR_MESSAGES.CONCURRENT_REQUEST);
    });

    it('ロック取得失敗時はストリームを開始しない', async () => {
      const guardMock = makeDefaultGuardMock();
      guardMock.acquireLock.mockResolvedValue({ acquired: false });
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      await POST(buildRequest({ text: 'こんにちは' }));
      expect(mockRunChatUseCase).not.toHaveBeenCalled();
    });

    it('ストリーム完了後に releaseLock が呼ばれる（finally で解放）', async () => {
      const guardMock = makeDefaultGuardMock();
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      await readNDJSONStream(res);

      expect(guardMock.releaseLock).toHaveBeenCalled();
    });

    it('runChatUseCase がエラーを投げてもストリーム後に releaseLock が呼ばれる', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const guardMock = makeDefaultGuardMock();
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      mockRunChatUseCase.mockImplementation(async function* () {
        throw new Error('エラー');
        yield { type: 'done' as const };
      });

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      await readNDJSONStream(res);

      expect(guardMock.releaseLock).toHaveBeenCalled();
    });

    it('releaseLock には acquireLock に渡したのと同じユーザー ID とトークンが渡される', async () => {
      const guardMock = makeDefaultGuardMock();
      let capturedOwnerToken: string | undefined;
      // acquireLock に渡されたトークンをキャプチャし、返却値もそのトークンにする
      guardMock.acquireLock.mockImplementation(
        async (_userId: string, ownerToken: string) => {
          capturedOwnerToken = ownerToken;
          return { acquired: true, ownerToken };
        }
      );
      mockGetChatGuardRepository.mockReturnValue(guardMock);

      mockRunChatUseCase.mockImplementation(async function* () {
        yield { type: 'done' };
      });

      const res = await POST(buildRequest({ text: 'こんにちは' }));
      await readNDJSONStream(res);

      // acquireLock に渡されたトークンが releaseLock にも渡されることを確認する
      expect(capturedOwnerToken).toBeDefined();
      expect(guardMock.releaseLock).toHaveBeenCalledWith('g1', capturedOwnerToken);
    });
  });
});
