import { MEMORY_API_ERROR_MESSAGES, deleteSelfFact, fetchSelfFacts } from '@/lib/memory/api-client';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const okJson = (data: unknown) => ({ ok: true, json: async () => data });
const fail = () => ({ ok: false, json: async () => ({}) });

beforeEach(() => jest.clearAllMocks());

describe('fetchSelfFacts', () => {
  it('characterId 未指定ならクエリなし', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ selfFacts: [] }));
    await fetchSelfFacts();
    expect(mockFetch).toHaveBeenCalledWith('/api/memory', expect.any(Object));
  });

  it('characterId を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ selfFacts: [{ id: 'y' }] }));
    const result = await fetchSelfFacts('ageha');
    expect(mockFetch).toHaveBeenCalledWith('/api/memory?characterId=ageha', expect.any(Object));
    expect(result).toEqual([{ id: 'y' }]);
  });

  it('selfFacts 欠落時は空配列', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    expect(await fetchSelfFacts()).toEqual([]);
  });

  it('失敗時は LIST_FAILED を投げる', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(fetchSelfFacts()).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.LIST_FAILED);
  });
});

describe('deleteSelfFact', () => {
  it('DELETE を呼ぶ', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteSelfFact('abc');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('characterId を指定するとクエリに付与される', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    await deleteSelfFact('abc', 'ageha');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/memory/abc?characterId=ageha',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('失敗時は DELETE_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(fail());
    await expect(deleteSelfFact('abc')).rejects.toThrow(MEMORY_API_ERROR_MESSAGES.DELETE_FAILED);
  });
});
