/**
 * @jest-environment node
 */
import { DELETE, GET, PATCH } from '@/app/api/memory/[id]/route';
import { getSession } from '@/lib/server/session';
import { getMemoryRepository } from '@/lib/server/repositories';
import { getEmbeddingClient } from '@/lib/server/embedding';
import { encodeMemoryId } from '@/lib/memory/memory-id';
import type { MemoryEntity, MemoryRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getMemoryRepository: jest.fn() }));
jest.mock('@/lib/server/embedding', () => ({ getEmbeddingClient: jest.fn() }));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getMemoryRepository as jest.MockedFunction<typeof getMemoryRepository>;
const mockGetEmbedding = getEmbeddingClient as jest.MockedFunction<typeof getEmbeddingClient>;

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
const jsonReq = (body: unknown) =>
  new Request('http://localhost/api/memory/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEmbedding.mockReturnValue({ embed: jest.fn(async () => [0.1, 0.2]) });
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

describe('PATCH /api/memory/:id', () => {
  it('content 編集時は embedding を再生成して update', async () => {
    mockGetSession.mockResolvedValue(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);
    const res = await PATCH(jsonReq({ content: '紅茶が好き' }), ctx(validId));
    expect(res.status).toBe(200);
    expect(mockGetEmbedding().embed).toHaveBeenCalledWith('紅茶が好き');
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ Content: '紅茶が好き', Embedding: [0.1, 0.2] })
    );
    expect(repo.put).not.toHaveBeenCalled();
  });

  it('category 変更時は put(新) + delete(旧)', async () => {
    mockGetSession.mockResolvedValue(session);
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);
    const res = await PATCH(jsonReq({ category: 'drink' }), ctx(validId));
    expect(res.status).toBe(200);
    expect(repo.put).toHaveBeenCalledWith(
      expect.objectContaining({ Category: 'drink', MemoryID: '01HZ' })
    );
    expect(repo.delete).toHaveBeenCalled();
  });

  it('不正な id は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await PATCH(jsonReq({ content: 'x' }), ctx('bad'));
    expect(res.status).toBe(400);
  });

  it('JSON でない body は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await PATCH(jsonReq('not-json'), ctx(validId));
    expect(res.status).toBe(400);
  });

  it('空 patch は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await PATCH(jsonReq({}), ctx(validId));
    expect(res.status).toBe(400);
  });

  it('存在しなければ 404', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo({ get: jest.fn(async () => null) }));
    const res = await PATCH(jsonReq({ content: 'x' }), ctx(validId));
    expect(res.status).toBe(404);
  });

  it('embedding 失敗でも update は継続（500 にしない）', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetEmbedding.mockReturnValue({
      embed: jest.fn(async () => {
        throw new Error('embed down');
      }),
    });
    const repo = makeRepo();
    mockGetRepo.mockReturnValue(repo);
    const res = await PATCH(jsonReq({ content: 'x' }), ctx(validId));
    expect(res.status).toBe(200);
    spy.mockRestore();
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
