/**
 * @jest-environment node
 */
import type { IMemoryRetriever } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/embedding', () => ({
  getEmbeddingClient: jest.fn().mockReturnValue({ embed: jest.fn() }),
}));

jest.mock('@/lib/server/repositories', () => ({
  getMemoryRepository: jest.fn().mockReturnValue({}),
}));

describe('lib/server/memory-retriever', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getMemoryRetriever はインスタンスを返す', async () => {
    const mod = await import('@/lib/server/memory-retriever');
    const r = mod.getMemoryRetriever();
    expect(r).toBeDefined();
  });

  it('getMemoryRetriever はシングルトンを返す', async () => {
    const mod = await import('@/lib/server/memory-retriever');
    const r1 = mod.getMemoryRetriever();
    const r2 = mod.getMemoryRetriever();
    expect(r1).toBe(r2);
  });

  it('setMemoryRetrieverForTesting でキャッシュを差し替えられる', async () => {
    const mod = await import('@/lib/server/memory-retriever');
    const mock = {} as IMemoryRetriever;
    mod.setMemoryRetrieverForTesting(mock);
    expect(mod.getMemoryRetriever()).toBe(mock);
  });

  it('setMemoryRetrieverForTesting(null) にすると次回呼び出しで新インスタンスを生成する', async () => {
    const mod = await import('@/lib/server/memory-retriever');
    const mock = {} as IMemoryRetriever;
    mod.setMemoryRetrieverForTesting(mock);
    mod.setMemoryRetrieverForTesting(null);
    const r = mod.getMemoryRetriever();
    expect(r).toBeDefined();
    expect(r).not.toBe(mock);
  });
});
