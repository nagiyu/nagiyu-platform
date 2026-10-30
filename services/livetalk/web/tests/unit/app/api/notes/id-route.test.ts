/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notes/[id]/route';
import { getSession } from '@/lib/server/session';
import { getNoteRepository, getTopicRepository } from '@/lib/server/repositories';
import { reportErrorEvent } from '@nagiyu/aws';
import { errorReporter } from '@/lib/server/api-error-reporting';
import type {
  NoteEntity,
  NoteRepository,
  TopicBundle,
  TopicRepository,
} from '@nagiyu/livetalk-core';
import { encodeNoteId } from '@/lib/notes/note-id';
import { NOTE_ERROR_MESSAGES } from '@/app/api/notes/constants';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({
  getNoteRepository: jest.fn(),
  getTopicRepository: jest.fn(),
}));
jest.mock('@nagiyu/aws', () => ({
  reportErrorEvent: jest.fn().mockResolvedValue(null),
  createErrorReporter: jest.fn(() => ({ report: jest.fn(), onError: jest.fn(() => jest.fn()) })),
}));

jest.mock('@/lib/server/api-error-reporting', () => ({
  ...jest.requireActual('@/lib/server/api-error-reporting'),
  errorReporter: {
    report: jest.fn().mockResolvedValue(null),
    onError: jest.fn(() => jest.fn()),
  },
}));

const mockReportErrorEvent = reportErrorEvent as jest.MockedFunction<typeof reportErrorEvent>;

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getNoteRepository as jest.MockedFunction<typeof getNoteRepository>;
const mockGetTopicRepo = getTopicRepository as jest.MockedFunction<typeof getTopicRepository>;

const session = {
  user: {
    id: 'u1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

const entity: NoteEntity = {
  userId: 'u1',
  characterId: 'hiyori',
  noteId: 'note-1',
  topicId: 'topic-1',
  subject: 'コーヒーの効能',
  headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  createdAt: 100,
  updatedAt: 100,
};

const makeBundle = (): TopicBundle => ({
  topic: null,
  selfFacts: [],
  webFacts: [
    {
      userId: 'u1',
      characterId: 'hiyori',
      topicId: 'topic-1',
      factId: 'fact-1',
      text: 'コーヒーには覚醒作用がある',
      sourceUrls: ['https://example.com'],
      volatility: 'stable',
      observedAt: 100,
      createdAt: 100,
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

const validId = encodeNoteId({ userId: 'u1', characterId: 'hiyori', noteId: 'note-1' });
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
    expect(json.note.headline).toBe(entity.headline);
    expect(json.note.webFacts).toEqual(['コーヒーには覚醒作用がある']);
    expect(json.note.sources).toEqual(['https://example.com']);
    // userId は SK ではなくセッションから（PK はクライアント入力を信用しない）
    expect(get).toHaveBeenCalledWith({ userId: 'u1', characterId: 'hiyori', noteId: 'note-1' });
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
    expect(json.note.headline).toBe(entity.headline);
    expect(json.note.webFacts).toBeUndefined();
    expect(json.note.sources).toBeUndefined();
    expect(errorReporter.report).toHaveBeenCalledTimes(1);
    expect(errorReporter.report).toHaveBeenCalledWith(
      'Web API: ノート参照先トピック取得エラー',
      expect.objectContaining({ message: 'topic fetch failed' }),
      { context: { characterId: expect.any(String) } }
    );
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
    expect(await res.json()).toEqual({
      error: 'FETCH_FAILED',
      message: NOTE_ERROR_MESSAGES.FETCH_FAILED,
    });
    expect(mockReportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Web API: ノート取得エラー', message: 'boom' })
    );
    spy.mockRestore();
  });
});
