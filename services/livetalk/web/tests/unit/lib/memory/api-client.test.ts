import {
  MEMORY_API_ERROR_MESSAGES,
  deleteMemory,
  fetchMemories,
  pinMemory,
  updateMemory,
} from '@/lib/memory/api-client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const okJson = (data: unknown) => ({ ok: true, json: async () => data });
const fail = () => ({ ok: false, json: async () => ({}) });

beforeEach(() => jest.clearAllMocks());

describe('fetchMemories', () => {
  it('tier 指定でクエリを付与し memories を返す', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memories: [{ id: 'x' }] }));
    const result = await fetchMemories('B');
    expect(mockFetch).toHaveBeenCalledWith('/api/memory?tier=B', expect.any(Object));
    expect(result).toEqual([{ id: 'x' }]);
  });

  it('tier 未指定ならクエリなし', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memories: [] }));
    await fetchMemories();
    expect(mockFetch).toHaveBeenCalledWith('/api/memory', expect.any(Object));
  });

  it('memories 欠落時は空配列', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    expect(await fetchMemories()).toEqual([]);
  });

  it('失敗時は LIST_FAILED を投げる', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(fetchMemories()).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.LIST_FAILED);
  });
});

describe('updateMemory', () => {
  it('PATCH で memory を返す', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memory: { id: 'x', content: 'c' } }));
    const result = await updateMemory('abc', { content: 'c' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(result).toEqual({ id: 'x', content: 'c' });
  });

  it('失敗時は UPDATE_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(updateMemory('abc', { content: 'c' })).rejects.toThrow(
      MEMORY_API_ERROR_MESSAGES.UPDATE_FAILED
    );
  });
});

describe('deleteMemory', () => {
  it('DELETE を呼ぶ', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteMemory('abc');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('失敗時は DELETE_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(deleteMemory('abc')).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.DELETE_FAILED);
  });
});

describe('pinMemory', () => {
  it('POST /pin で memory を返す', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memory: { id: 'x', tier: 'A' } }));
    const result = await pinMemory('abc');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc/pin',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({ id: 'x', tier: 'A' });
  });

  it('失敗時は PIN_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(pinMemory('abc')).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.PIN_FAILED);
  });
});
