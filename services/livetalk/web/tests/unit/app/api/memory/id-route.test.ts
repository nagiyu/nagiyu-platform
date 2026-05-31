/**
 * @jest-environment node
 */
import { DELETE, GET } from '@/app/api/memory/[id]/route';
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
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 2,
  CreatedAt: 1,
  UpdatedAt: 1,
};

const validId = encodeMemoryId({
  userId: 'g1',
  characterId: 'hiyori',
  tier: 'B',
  category: 'food',
  memoryId: '01HZ',
});

const makeRepo = (over: Partial<MemoryRepository> = {}): MemoryRepository =>
  ({
    get: jest.fn(async () => entity),
    update: jest.fn(async (input) => ({ ...entity, ...input })),
    put: jest.fn(async (input) => ({ ...entity, ...input })),
    delete: jest.fn(async () => undefined),
    listByTier: jest.fn(),
    listByCategory: jest.fn(),
    promote: jest.fn(),
    demote: jest.fn(),
    ...over,
  }) as unknown as MemoryRepository;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/memory/:id', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(401);
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await GET(new Request('http://localhost'), ctx('not-valid'));
    expect(res.status).toBe(400);
  });

  it('存在しなければ 404', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo({ get: jest.fn(async () => null) }));
    const res = await GET(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(404);
  });

  it('存在すれば 200 で DTO を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await GET(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.memory.content).toBe('コーヒーが好き');
  });
});

describe('DELETE /api/memory/:id', () => {
  it('削除して 200', async () => {
    mockGetSession.mockResolvedValue(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);
    const res = await DELETE(new Request('http://localhost'), ctx(validId));
    expect(res.status).toBe(200);
    expect(repo.delete).toHaveBeenCalled();
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await DELETE(new Request('http://localhost'), ctx('bad'));
    expect(res.status).toBe(400);
  });
});
