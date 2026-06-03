/**
 * @jest-environment node
 */
import { POST } from '@/app/api/memory/[id]/pin/route';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { encodeMemoryId } from '@/lib/memory/memory-id';
import type { MemoryEntity, MemoryRepository } from '@nagiyu/livetalk-core';

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

const entity: MemoryEntity = {
  UserID: 'g1',
  CharacterID: 'hiyori',
  MemoryID: '01HZ',
  Tier: 'C',
  Category: 'food',
  Content: 'コーヒー',
  Confidence: 0.5,
  ReferencedCount: 1,
  CreatedAt: 1,
  UpdatedAt: 1,
};

const idC = encodeMemoryId({
  userId: 'g1',
  characterId: 'hiyori',
  tier: 'C',
  category: 'food',
  memoryId: '01HZ',
});

const makeRepo = (over: Partial<MemoryRepository> = {}): MemoryRepository =>
  ({
    get: jest.fn(async () => entity),
    promote: jest.fn(async (m: MemoryEntity) => ({ ...m, Tier: 'A' as const })),
    put: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listByTier: jest.fn(),
    listByCategory: jest.fn(),
    demote: jest.fn(),
    ...over,
  }) as unknown as MemoryRepository;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = () => new Request('http://localhost/api/memory/x/pin', { method: 'POST' });

beforeEach(() => jest.clearAllMocks());

describe('POST /api/memory/:id/pin', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await POST(post(), ctx(idC));
    expect(res.status).toBe(401);
  });

  it('Tier A に昇格して返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);
    const res = await POST(post(), ctx(idC));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.memory.tier).toBe('A');
    expect(repo.promote).toHaveBeenCalledWith(expect.objectContaining({ MemoryID: '01HZ' }), 'A');
  });

  it('既に Tier A なら promote せず現状を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const repo = makeRepo({ get: jest.fn(async () => ({ ...entity, Tier: 'A' as const })) });
    mockGetRepo.mockReturnValue(repo);
    const idA = encodeMemoryId({
      userId: 'g1',
      characterId: 'hiyori',
      tier: 'A',
      category: 'food',
      memoryId: '01HZ',
    });
    const res = await POST(post(), ctx(idA));
    expect(res.status).toBe(200);
    expect(repo.promote).not.toHaveBeenCalled();
  });

  it('存在しなければ 404', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo({ get: jest.fn(async () => null) }));
    const res = await POST(post(), ctx(idC));
    expect(res.status).toBe(404);
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await POST(post(), ctx('bad'));
    expect(res.status).toBe(400);
  });
});
