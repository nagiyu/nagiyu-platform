/**
 * @jest-environment node
 */
import { GET } from '@/app/api/memory/route';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import type { MemoryEntity, MemoryRepository } from '@nagiyu/livetalk-core';
import { decodeMemoryId } from '@/lib/memory/memory-id';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getMemoryRepository: jest.fn() }));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getMemoryRepository as jest.MockedFunction<typeof getMemoryRepository>;

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

const makeEntity = (over: Partial<MemoryEntity> = {}): MemoryEntity => ({
  UserID: 'g1',
  CharacterID: 'hiyori',
  MemoryID: '01HZ',
  Tier: 'A',
  Category: 'name',
  Content: 'name is taro',
  Confidence: 1,
  ReferencedCount: 0,
  CreatedAt: 1,
  UpdatedAt: 1,
  ...over,
});

const makeRepo = (over: Partial<MemoryRepository> = {}): MemoryRepository =>
  ({
    listByTier: jest.fn(async () => []),
    get: jest.fn(),
    put: jest.fn(),
    listByCategory: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    promote: jest.fn(),
    demote: jest.fn(),
    ...over,
  }) as unknown as MemoryRepository;

const req = (url = 'http://localhost/api/memory') => new Request(url, { method: 'GET' });

beforeEach(() => jest.clearAllMocks());

describe('GET /api/memory', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('tier 未指定なら A/B/C を横断取得しソートして返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const listByTier = jest.fn(async (_u: string, _c: string, tier: string) => {
      if (tier === 'A') return [makeEntity({ MemoryID: 'a', Tier: 'A', LastReferencedAt: 100 })];
      if (tier === 'B') return [makeEntity({ MemoryID: 'b', Tier: 'B', LastReferencedAt: 200 })];
      return [];
    });
    mockGetRepo.mockReturnValue(makeRepo({ listByTier }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.memories).toHaveLength(2);
    // LastReferencedAt 降順 → b が先頭
    expect(json.memories[0].tier).toBe('B');
    expect(listByTier).toHaveBeenCalledTimes(3);
    // id は decode 可能
    expect(decodeMemoryId(json.memories[0].id, 'g1')?.memoryId).toBe('b');
  });

  it('tier 指定ならその Tier のみ取得', async () => {
    mockGetSession.mockResolvedValue(session);
    const listByTier = jest.fn(async () => [makeEntity({ Tier: 'C' })]);
    mockGetRepo.mockReturnValue(makeRepo({ listByTier }));

    const res = await GET(req('http://localhost/api/memory?tier=C'));
    expect(res.status).toBe(200);
    expect(listByTier).toHaveBeenCalledTimes(1);
    expect(listByTier).toHaveBeenCalledWith('g1', 'hiyori', 'C');
  });

  it('不正な tier は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await GET(req('http://localhost/api/memory?tier=Z'));
    expect(res.status).toBe(400);
  });

  it('DB エラーは 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(
      makeRepo({
        listByTier: jest.fn(async () => {
          throw new Error('db');
        }),
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
