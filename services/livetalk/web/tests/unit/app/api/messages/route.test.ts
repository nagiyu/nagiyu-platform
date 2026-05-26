/**
 * @jest-environment node
 */
import { GET } from '@/app/api/messages/route';
import { MESSAGES_ERROR_MESSAGES } from '@/app/api/messages/constants';
import { getSession } from '@/lib/server/session';
import { getMessageRepository } from '@/lib/server/repositories';
import type { MessageRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getMessageRepository: jest.fn() }));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getMessageRepository as jest.MockedFunction<typeof getMessageRepository>;

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

const buildRequest = (search: string = ''): Request =>
  new Request(`http://localhost/api/messages${search}`, { method: 'GET' });

const makeRepo = (overrides: Partial<MessageRepository> = {}): MessageRepository => {
  const create: MessageRepository['create'] = jest.fn();
  const getById: MessageRepository['getById'] = jest.fn(async () => null);
  const getRecentByTokenBudget: MessageRepository['getRecentByTokenBudget'] = jest.fn(async () => ({
    messages: [
      {
        UserID: 'g1',
        CharacterID: 'hiyori',
        MessageID: 'm1',
        Role: 'user' as const,
        Text: 'hello',
        CreatedAt: 1_700_000_000_000,
        UpdatedAt: 1_700_000_000_000,
      },
      {
        UserID: 'g1',
        CharacterID: 'hiyori',
        MessageID: 'm2',
        Role: 'assistant' as const,
        Text: 'hi',
        CreatedAt: 1_700_000_000_001,
        UpdatedAt: 1_700_000_000_001,
      },
    ],
    totalTokens: 10,
    truncated: false,
  }));
  return { create, getById, getRecentByTokenBudget, ...overrides };
};

describe('GET /api/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepo.mockReturnValue(makeRepo());
  });

  it('未認証時は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const response = await GET(buildRequest());
    expect(response.status).toBe(401);
  });

  it('permission がない場合は 403', async () => {
    mockGetSession.mockResolvedValueOnce({
      ...validSession,
      user: { ...validSession.user, roles: ['guest'] },
    });
    const response = await GET(buildRequest());
    expect(response.status).toBe(403);
  });

  describe('認証済み', () => {
    beforeEach(() => mockGetSession.mockResolvedValue(validSession));

    it('既定で hiyori キャラの直近メッセージを時系列昇順で返す', async () => {
      const repo = makeRepo();
      mockGetRepo.mockReturnValue(repo);

      const response = await GET(buildRequest());
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.messages).toEqual([
        {
          messageId: 'm1',
          characterId: 'hiyori',
          role: 'user',
          text: 'hello',
          createdAt: 1_700_000_000_000,
        },
        {
          messageId: 'm2',
          characterId: 'hiyori',
          role: 'assistant',
          text: 'hi',
          createdAt: 1_700_000_000_001,
        },
      ]);
      expect(json.totalTokens).toBe(10);
      expect(json.truncated).toBe(false);
      expect(repo.getRecentByTokenBudget).toHaveBeenCalledWith({
        userId: 'g1',
        characterId: 'hiyori',
        tokenLimit: undefined,
      });
    });

    it('characterId クエリで対象キャラを差し替えできる', async () => {
      const repo = makeRepo();
      mockGetRepo.mockReturnValue(repo);
      await GET(buildRequest('?characterId=other'));
      expect(repo.getRecentByTokenBudget).toHaveBeenCalledWith(
        expect.objectContaining({ characterId: 'other' })
      );
    });

    it('tokenLimit クエリが範囲内なら値が渡る', async () => {
      const repo = makeRepo();
      mockGetRepo.mockReturnValue(repo);
      await GET(buildRequest('?tokenLimit=1000'));
      expect(repo.getRecentByTokenBudget).toHaveBeenCalledWith(
        expect.objectContaining({ tokenLimit: 1000 })
      );
    });

    it('tokenLimit が極端に小さいと 400 INVALID_REQUEST', async () => {
      const response = await GET(buildRequest('?tokenLimit=1'));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.message).toBe(MESSAGES_ERROR_MESSAGES.INVALID_REQUEST);
    });

    it('tokenLimit が NaN だと 400 INVALID_REQUEST', async () => {
      const response = await GET(buildRequest('?tokenLimit=abc'));
      expect(response.status).toBe(400);
    });

    it('tokenLimit が上限超過だと 400 INVALID_REQUEST', async () => {
      const response = await GET(buildRequest('?tokenLimit=999999999'));
      expect(response.status).toBe(400);
    });

    it('リポジトリエラーは 500 FETCH_FAILED', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetRepo.mockReturnValue(
        makeRepo({
          getRecentByTokenBudget: jest.fn(async () => {
            throw new Error('boom');
          }),
        })
      );
      const response = await GET(buildRequest());
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.message).toBe(MESSAGES_ERROR_MESSAGES.FETCH_FAILED);
      consoleSpy.mockRestore();
    });
  });
});
