/**
 * @jest-environment node
 */
import { POST } from '@/app/api/chat/route';
import { CHAT_ERROR_MESSAGES, CHAT_MAX_TEXT_LENGTH } from '@/app/api/chat/constants';
import { getSession } from '@/lib/server/session';
import { getLLMClient } from '@/lib/server/llm';
import { getVoicevoxClient } from '@/lib/server/voicevox';
import { getMessageRepository } from '@/lib/server/repositories';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/llm', () => ({ getLLMClient: jest.fn() }));
jest.mock('@/lib/server/voicevox', () => ({ getVoicevoxClient: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({
  getMessageRepository: jest.fn(),
  getMemoryRepository: jest.fn().mockReturnValue({}),
  getCharacterStateRepository: jest.fn().mockReturnValue({}),
  getLifecycleRepository: jest.fn().mockReturnValue({}),
  getKnowledgeRepository: jest.fn().mockReturnValue({}),
  getStudyTopicRepository: jest.fn().mockReturnValue({}),
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
    (getVoicevoxClient as jest.Mock).mockReturnValue({});
    (getMessageRepository as jest.Mock).mockReturnValue({});
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
  });
});
