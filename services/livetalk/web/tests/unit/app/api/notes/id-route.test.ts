/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notes/[id]/route';
import { getSession } from '@/lib/server/session';
import { getNoteRepository } from '@/lib/server/repositories';
import type { NoteEntity, NoteRepository } from '@nagiyu/livetalk-core';
import { encodeNoteId } from '@/lib/notes/note-id';

jest.mock('@/lib/server/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/server/repositories', () => ({ getNoteRepository: jest.fn() }));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetRepo = getNoteRepository as jest.MockedFunction<typeof getNoteRepository>;

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
  Title: 'コーヒーの効能',
  Body: '本文。\n\nコメント。',
  RelatedKnowledgeIds: ['know-1'],
  RelatedCategory: 'コーヒー',
  CreatedAt: 100,
  UpdatedAt: 100,
};

const makeRepo = (over: Partial<NoteRepository> = {}): NoteRepository =>
  ({
    list: jest.fn(),
    get: jest.fn(async () => null),
    put: jest.fn(),
    listRecent: jest.fn(),
    ...over,
  }) as unknown as NoteRepository;

const validId = encodeNoteId({ userId: 'g1', characterId: 'hiyori', noteId: 'note-1' });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request('http://localhost/api/notes/x', { method: 'GET' });

beforeEach(() => jest.clearAllMocks());

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

  it('本文付きで詳細を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    const get = jest.fn(async () => entity);
    mockGetRepo.mockReturnValue(makeRepo({ get }));

    const res = await GET(req(), ctx(validId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note.title).toBe('コーヒーの効能');
    expect(json.note.body).toBe('本文。\n\nコメント。');
    // userId は SK ではなくセッションから（PK はクライアント入力を信用しない）
    expect(get).toHaveBeenCalledWith({ userId: 'g1', characterId: 'hiyori', noteId: 'note-1' });
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
