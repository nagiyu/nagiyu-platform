/**
 * @jest-environment node
 */
import { GET } from '@/app/api/memory/route';
import { getSession } from '@/lib/server/session';
import { getTopicRepository } from '@/lib/server/repositories';
import type { SelfFactEntity, TopicEntity, TopicRepository } from '@nagiyu/livetalk-core';
import { decodeSelfFactId } from '@/lib/memory/memory-id';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getTopicRepository: jest.fn() }));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetTopicRepository = getTopicRepository as jest.MockedFunction<typeof getTopicRepository>;

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

const makeTopic = (over: Partial<TopicEntity> = {}): TopicEntity => ({
  UserID: 'g1',
  CharacterID: 'hiyori',
  TopicID: 't1',
  Subject: '好きな食べ物',
  CanonicalSummary: '',
  Category: 'preference',
  Care: 1,
  Embedding: [],
  CreatedAt: 1,
  UpdatedAt: 1,
  ...over,
});

const makeFact = (over: Partial<SelfFactEntity> = {}): SelfFactEntity => ({
  UserID: 'g1',
  CharacterID: 'hiyori',
  TopicID: 't1',
  FactID: 'f1',
  Text: 'カレーが好き',
  Provenance: '',
  CreatedAt: 1,
  ...over,
});

const makeRepo = (over: Partial<TopicRepository> = {}): TopicRepository =>
  ({
    listTopicHeaders: jest.fn(async () => []),
    listSelfFacts: jest.fn(async () => []),
    putTopic: jest.fn(),
    getTopic: jest.fn(),
    getTopicBundle: jest.fn(),
    listTopicHeadersByCareDesc: jest.fn(),
    putSelfFact: jest.fn(),
    deleteSelfFact: jest.fn(),
    putWebFact: jest.fn(),
    listWebFacts: jest.fn(),
    ...over,
  }) as unknown as TopicRepository;

const req = (url = 'http://localhost/api/memory') => new Request(url, { method: 'GET' });

beforeEach(() => jest.clearAllMocks());

describe('GET /api/memory', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('Topic ヘッダを列挙し各 Topic の SELF fact を集約してソートして返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const listTopicHeaders = jest.fn(async () => [
      makeTopic({ TopicID: 't1', Subject: '好きな食べ物' }),
      makeTopic({ TopicID: 't2', Subject: '仕事' }),
    ]);
    const listSelfFacts = jest.fn(async (_u: string, _c: string, topicId: string) => {
      if (topicId === 't1') return [makeFact({ TopicID: 't1', FactID: 'a', CreatedAt: 100 })];
      if (topicId === 't2') return [makeFact({ TopicID: 't2', FactID: 'b', CreatedAt: 200 })];
      return [];
    });
    mockGetTopicRepository.mockReturnValue(makeRepo({ listTopicHeaders, listSelfFacts }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.selfFacts).toHaveLength(2);
    // createdAt 降順 → b(200) が先頭
    expect(json.selfFacts[0].topicId).toBe('t2');
    expect(listSelfFacts).toHaveBeenCalledTimes(2);
    // id は decode 可能
    expect(decodeSelfFactId(json.selfFacts[0].id, 'g1')?.factId).toBe('b');
  });

  it('Topic が 0 件なら空配列', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetTopicRepository.mockReturnValue(makeRepo());
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.selfFacts).toEqual([]);
  });

  it('characterId クエリを指定するとそのキャラの Topic を取得する', async () => {
    mockGetSession.mockResolvedValue(session);
    const listTopicHeaders = jest.fn(async () => []);
    mockGetTopicRepository.mockReturnValue(makeRepo({ listTopicHeaders }));

    const res = await GET(req('http://localhost/api/memory?characterId=ageha'));
    expect(res.status).toBe(200);
    expect(listTopicHeaders).toHaveBeenCalledWith('g1', 'ageha');
  });

  it('不正な characterId は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetTopicRepository.mockReturnValue(makeRepo());
    const res = await GET(req('http://localhost/api/memory?characterId=unknown'));
    expect(res.status).toBe(400);
  });

  it('DB エラーは 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetTopicRepository.mockReturnValue(
      makeRepo({
        listTopicHeaders: jest.fn(async () => {
          throw new Error('db');
        }),
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
