/**
 * @jest-environment node
 */
import { GET } from '@/app/api/notes/route';
import { getSession } from '@/lib/server/session';
import { getNoteRepository } from '@/lib/server/repositories';
import type { NoteEntity, NoteRepository } from '@nagiyu/livetalk-core';
import { decodeNoteId } from '@/lib/notes/note-id';

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

const makeEntity = (over: Partial<NoteEntity> = {}): NoteEntity => ({
  UserID: 'g1',
  CharacterID: 'hiyori',
  NoteID: 'note-1',
  TopicID: 'topic-1',
  Subject: 'コーヒーの効能',
  Headline: 'この前の話、気になって調べてみたよ。覚醒効果があるみたい！',
  CreatedAt: 100,
  UpdatedAt: 100,
  ...over,
});

const makeRepo = (over: Partial<NoteRepository> = {}): NoteRepository =>
  ({
    list: jest.fn(async () => []),
    listAll: jest.fn(async () => []),
    get: jest.fn(),
    put: jest.fn(),
    listRecent: jest.fn(),
    updateReaction: jest.fn(),
    ...over,
  }) as unknown as NoteRepository;

const req = () => new Request('http://localhost/api/notes', { method: 'GET' });

beforeEach(() => jest.clearAllMocks());

describe('GET /api/notes', () => {
  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('一覧を作成日時降順で返す（本文は含めない）', async () => {
    mockGetSession.mockResolvedValue(session);
    const listAll = jest.fn(async () => [
      makeEntity({ NoteID: 'old', CreatedAt: 100 }),
      makeEntity({ NoteID: 'new', CreatedAt: 300 }),
    ]);
    mockGetRepo.mockReturnValue(makeRepo({ listAll }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toHaveLength(2);
    expect(json.notes[0].headline).toBeUndefined();
    expect(decodeNoteId(json.notes[0].id, 'g1')?.noteId).toBe('new');
  });

  it('listAll が呼ばれる（list ではない）', async () => {
    mockGetSession.mockResolvedValue(session);
    const listAll = jest.fn(async () => []);
    const list = jest.fn(async () => []);
    mockGetRepo.mockReturnValue(makeRepo({ listAll, list }));

    await GET(req());

    expect(listAll).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('100 件を超えても全件を返す', async () => {
    mockGetSession.mockResolvedValue(session);
    // listAll が 150 件返すシナリオ（全件を打ち切らずに返す）
    const items = Array.from({ length: 150 }, (_, i) =>
      makeEntity({ NoteID: `note-${i}`, CreatedAt: i })
    );
    const listAll = jest.fn(async () => items);
    mockGetRepo.mockReturnValue(makeRepo({ listAll }));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notes).toHaveLength(150);
  });

  it('characterId クエリを指定するとそのキャラのノートを取得する', async () => {
    mockGetSession.mockResolvedValue(session);
    const listAll = jest.fn(async () => [makeEntity({ CharacterID: 'ageha' })]);
    mockGetRepo.mockReturnValue(makeRepo({ listAll }));

    const req2 = () =>
      new Request('http://localhost/api/notes?characterId=ageha', { method: 'GET' });
    const res = await GET(req2());
    expect(res.status).toBe(200);
    expect(listAll).toHaveBeenCalledWith('g1', 'ageha');
  });

  it('不正な characterId は 400', async () => {
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(makeRepo());
    const req2 = () =>
      new Request('http://localhost/api/notes?characterId=unknown', { method: 'GET' });
    const res = await GET(req2());
    expect(res.status).toBe(400);
  });

  it('DB エラーは 500', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(session);
    mockGetRepo.mockReturnValue(
      makeRepo({
        listAll: jest.fn(async () => {
          throw new Error('boom');
        }),
      })
    );
    const res = await GET(req());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});
