import {
  MEMORY_API_ERROR_MESSAGES,
  deleteMemory,
  fetchMemories,
  pinMemory,
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

  it('characterId を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memories: [{ id: 'y' }] }));
    const result = await fetchMemories(undefined, 'ageha');
    expect(mockFetch).toHaveBeenCalledWith('/api/memory?characterId=ageha', expect.any(Object));
    expect(result).toEqual([{ id: 'y' }]);
  });

  it('tier と characterId の両方を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memories: [{ id: 'z' }] }));
    await fetchMemories('A', 'ageha');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory?tier=A&characterId=ageha',
      expect.any(Object)
    );
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

describe('deleteMemory', () => {
  it('DELETE を呼ぶ', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteMemory('abc');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('characterId を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteMemory('abc', 'ageha');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc?characterId=ageha',
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

  it('characterId を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ memory: { id: 'x', tier: 'A' } }));
    await pinMemory('abc', 'ageha');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc/pin?characterId=ageha',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('失敗時は PIN_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(pinMemory('abc')).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.PIN_FAILED);
  });
});
