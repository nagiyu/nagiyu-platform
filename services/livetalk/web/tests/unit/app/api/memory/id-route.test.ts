/**
 * @jest-environment node
 */
import { EntityNotFoundError } from '@nagiyu/aws';
import { DELETE } from '@/app/api/memory/[id]/route';
import { getSession } from '@/lib/server/session';
import { getLLMClient } from '@/lib/server/llm';
import { encodeSelfFactId } from '@/lib/memory/memory-id';
import { MEMORY_ERROR_MESSAGES } from '@/app/api/memory/constants';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/llm', () => ({ getLLMClient: jest.fn() }));

// forgetSelfFact をモック化して usecase の内部挙動を切り離す
jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  forgetSelfFact: jest.fn(),
  createTopicRepository: jest.fn(),
}));

import { forgetSelfFact, createTopicRepository } from '@nagiyu/livetalk-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetTopicRepository = createTopicRepository as jest.MockedFunction<
  typeof createTopicRepository
>;
const mockGetLLMClient = getLLMClient as jest.MockedFunction<typeof getLLMClient>;
const mockForgetSelfFact = forgetSelfFact as jest.Mock;

const session = {
  user: {
    id: 'u1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const validId = encodeSelfFactId({
  userId: 'u1',
  characterId: 'hiyori',
  topicId: 't1',
  factId: 'f1',
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTopicRepository.mockReturnValue({} as never);
  mockGetLLMClient.mockReturnValue({} as never);
  mockForgetSelfFact.mockResolvedValue(undefined);
});

describe('DELETE /api/memory/:id', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await DELETE(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(401);
  });

  it('forgetSelfFact を呼び、成功時は 200 { deleted: true } を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const res = await DELETE(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: true });
    expect(mockForgetSelfFact).toHaveBeenCalledWith(
      { userId: 'u1', characterId: 'hiyori', topicId: 't1', factId: 'f1' },
      expect.objectContaining({ topicRepository: expect.anything(), llmClient: expect.anything() })
    );
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    const res = await DELETE(new Request('http://localhost'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(mockForgetSelfFact).not.toHaveBeenCalled();
  });

  it('forgetSelfFact が EntityNotFoundError を投げた場合 (SELF fact も Topic もない) は 404 NOT_FOUND を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    mockForgetSelfFact.mockRejectedValue(new EntityNotFoundError('SelfFact', 'f1'));

    const res = await DELETE(new Request('http://localhost'), ctx(validId));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'NOT_FOUND',
      message: MEMORY_ERROR_MESSAGES.NOT_FOUND,
    });
  });

  it('forgetSelfFact が例外を投げた場合は 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockForgetSelfFact.mockRejectedValue(new Error('lock 競合'));

    const res = await DELETE(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
