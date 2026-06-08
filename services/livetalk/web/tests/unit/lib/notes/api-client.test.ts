import { NOTE_API_ERROR_MESSAGES, fetchNote, fetchNotes } from '@/lib/notes/api-client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const okJson = (data: unknown) => ({ ok: true, json: async () => data });
const fail = () => ({ ok: false, json: async () => ({}) });

beforeEach(() => jest.clearAllMocks());

describe('fetchNotes', () => {
  it('一覧を取得する', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ notes: [{ id: 'x', title: 't' }] }));
    const result = await fetchNotes();
    expect(mockFetch).toHaveBeenCalledWith('/api/notes', expect.any(Object));
    expect(result).toEqual([{ id: 'x', title: 't' }]);
  });

  it('notes 欠落時は空配列', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    expect(await fetchNotes()).toEqual([]);
  });

  it('失敗時は LIST_FAILED を投げる', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(fetchNotes()).rejects.toThrow(NOTE_API_ERROR_MESSAGES.LIST_FAILED);
  });
});

describe('fetchNote', () => {
  it('id をエンコードして詳細を取得する', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ note: { id: 'abc', title: 't', body: 'b' } }));
    const result = await fetchNote('a/b');
    expect(mockFetch).toHaveBeenCalledWith('/api/notes/a%2Fb', expect.any(Object));
    expect(result).toEqual({ id: 'abc', title: 't', body: 'b' });
  });

  it('失敗時は DETAIL_FAILED を投げる', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(fetchNote('abc')).rejects.toThrow(NOTE_API_ERROR_MESSAGES.DETAIL_FAILED);
  });
});
