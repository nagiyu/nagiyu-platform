/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notes/[id]/route';
import { getSession } from '@/lib/server/session';
import { getNoteRepository, getTopicRepository } from '@/lib/server/repositories';
import type {
  NoteEntity,
  NoteRepository,
  TopicBundle,
  TopicRepository,
} from '@nagiyu/livetalk-core';
import { encodeNoteId } from '@/lib/notes/note-id';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({
  getNoteRepository: jest.fn(),
  getTopicRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getNoteRepository as jest.MockedFunction<typeof getNoteRepository>;
const mockGetTopicRepo = getTopicRepository as jest.MockedFunction<typeof getTopicRepository>;

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

const entity: NoteEntity = {
  UserID: 'g1',
  CharacterID: 'hiyori',
  NoteID: 'note-1',
  TopicID: 'topic-1',
  Subject: 'コーヒーの効能',
  Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  CreatedAt: 100,
  UpdatedAt: 100,
};

const makeBundle = (): TopicBundle => ({
  topic: null,
  selfFacts: [],
  webFacts: [
    {
      UserID: 'g1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      FactID: 'fact-1',
      Text: 'コーヒーには覚醒作用がある',
      SourceUrls: ['https://example.com'],
      Volatility: 'stable',
      ObservedAt: 100,
      CreatedAt: 100,
    },
  ],
});

const makeRepo = (over: Partial<NoteRepository> = {}): NoteRepository =>
  ({
    list: jest.fn(),
    listAll: jest.fn(),
    get: jest.fn(async () => null),
    put: jest.fn(),
    listRecent: jest.fn(),
    updateReaction: jest.fn(),
    ...over,
  }) as unknown as NoteRepository;

const makeTopicRepo = (over: Partial<TopicRepository> = {}): TopicRepository =>
  ({
    putTopic: jest.fn(),
    getTopic: jest.fn(),
    getTopicBundle: jest.fn(async () => makeBundle()),
    listTopicHeaders: jest.fn(),
    listTopicHeadersByCareDesc: jest.fn(),
    putSelfFact: jest.fn(),
    listSelfFacts: jest.fn(),
    deleteSelfFact: jest.fn(),
    putWebFact: jest.fn(),
    listWebFacts: jest.fn(),
    listStaleWebFacts: jest.fn(),
    updateWebFactNextReview: jest.fn(),
    ...over,
  }) as unknown as TopicRepository;

const validId = encodeNoteId({ userId: 'g1', characterId: 'hiyori', noteId: 'note-1' });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request('http://localhost/api/notes/x', { method: 'GET' });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTopicRepo.mockReturnValue(makeTopicRepo());
});

describe('GET /api/notes/:id', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(401);
  });

  it('不正な ID は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const res = await GET(req(), ctx('!!!not-base64!!!###'));
    expect(res.status).toBe(400);
  });

  it('存在しないノートは 404', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo({ get: jest.fn(async () => null) }));
    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(404);
  });

  it('参照先 Topic の最新状態を反映した詳細を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const get = jest.fn(async () => entity);
    mockGetRepo.mockReturnValue(makeRepo({ get }));

    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note.subject).toBe('コーヒーの効能');
    expect(json.note.headline).toBe(entity.Headline);
    expect(json.note.webFacts).toEqual(['コーヒーには覚醒作用がある']);
    expect(json.note.sources).toEqual(['https://example.com']);
    // userId は SK ではなくセッションから（PK はクライアント入力を信用しない）
    expect(get).toHaveBeenCalledWith({ userId: 'g1', characterId: 'hiyori', noteId: 'note-1' });
  });

  it('Topic 取得に失敗しても headline のみで 200 を返す（fail-soft）', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo({ get: jest.fn(async () => entity) }));
    mockGetTopicRepo.mockReturnValue(
      makeTopicRepo({
        getTopicBundle: jest.fn(async () => {
          throw new Error('topic fetch failed');
        }),
      })
    );

    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note.headline).toBe(entity.Headline);
    expect(json.note.webFacts).toBeUndefined();
    expect(json.note.sources).toBeUndefined();
    spy.mockRestore();
  });

  it('DB エラーは 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(
      makeRepo({
        get: jest.fn(async () => {
          throw new Error('boom');
        }),
      })
    );
    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
