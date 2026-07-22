/**
 * @jest-environment node
 */
import { DELETE } from '@/app/api/memory/[id]/route';
import { getSession } from '@/lib/server/session';
import { getTopicRepository } from '@/lib/server/repositories';
import { getLLMClient } from '@/lib/server/llm';
import { encodeSelfFactId } from '@/lib/memory/memory-id';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getTopicRepository: jest.fn() }));
jest.mock('@/lib/server/llm', () => ({ getLLMClient: jest.fn() }));

// forgetSelfFact をモック化して usecase の内部挙動を切り離す
jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  forgetSelfFact: jest.fn(),
}));

import { forgetSelfFact } from '@nagiyu/livetalk-core';

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetTopicRepository = getTopicRepository as jest.MockedFunction<typeof getTopicRepository>;
const mockGetLLMClient = getLLMClient as jest.MockedFunction<typeof getLLMClient>;
const mockForgetSelfFact = forgetSelfFact as jest.Mock;

const session = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const validId = encodeSelfFactId({
  userId: 'g1',
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
      { userId: 'g1', characterId: 'hiyori', topicId: 't1', factId: 'f1' },
      expect.objectContaining({ topicRepository: expect.anything(), llmClient: expect.anything() })
    );
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    const res = await DELETE(new Request('http://localhost'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(mockForgetSelfFact).not.toHaveBeenCalled();
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
