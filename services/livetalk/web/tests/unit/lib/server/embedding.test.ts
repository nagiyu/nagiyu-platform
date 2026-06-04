import { getEmbeddingClient, setEmbeddingClientForTesting } from '@/lib/server/embedding';
import type { IEmbeddingClient } from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  createEmbeddingClient: jest.fn(() => ({ embed: jest.fn(async () => [0.1]) })),
}));

import { createEmbeddingClient } from '@nagiyu/livetalk-core';

const mockCreate = createEmbeddingClient as jest.MockedFunction<typeof createEmbeddingClient>;

describe('getEmbeddingClient', () => {
  beforeEach(() => {
    setEmbeddingClientForTesting(null);
    jest.clearAllMocks();
  });

  it('初回は factory で生成し、2 回目はキャッシュを返す', () => {
    const first = getEmbeddingClient();
    const second = getEmbeddingClient();
    expect(first).toBe(second);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('setEmbeddingClientForTesting で差し替えできる', () => {
    const fake = { embed: jest.fn(async () => [1, 2, 3]) } as IEmbeddingClient;
    setEmbeddingClientForTesting(fake);
    expect(getEmbeddingClient()).toBe(fake);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
