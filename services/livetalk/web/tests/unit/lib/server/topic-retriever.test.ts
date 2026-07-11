/**
 * @jest-environment node
 */
import type { ITopicRetriever } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/embedding', () => ({
  getEmbeddingClient: jest.fn().mockReturnValue({ embed: jest.fn() }),
}));

jest.mock('@/lib/server/repositories', () => ({
  getTopicRepository: jest.fn().mockReturnValue({}),
}));

describe('lib/server/topic-retriever', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getTopicRetriever はインスタンスを返す', async () => {
    const mod = await import('@/lib/server/topic-retriever');
    const r = mod.getTopicRetriever();
    expect(r).toBeDefined();
  });

  it('getTopicRetriever はシングルトンを返す', async () => {
    const mod = await import('@/lib/server/topic-retriever');
    const r1 = mod.getTopicRetriever();
    const r2 = mod.getTopicRetriever();
    expect(r1).toBe(r2);
  });

  it('setTopicRetrieverForTesting でキャッシュを差し替えられる', async () => {
    const mod = await import('@/lib/server/topic-retriever');
    const mock = {} as ITopicRetriever;
    mod.setTopicRetrieverForTesting(mock);
    expect(mod.getTopicRetriever()).toBe(mock);
  });

  it('setTopicRetrieverForTesting(null) にすると次回呼び出しで新インスタンスを生成する', async () => {
    const mod = await import('@/lib/server/topic-retriever');
    const mock = {} as ITopicRetriever;
    mod.setTopicRetrieverForTesting(mock);
    mod.setTopicRetrieverForTesting(null);
    const r = mod.getTopicRetriever();
    expect(r).toBeDefined();
    expect(r).not.toBe(mock);
  });
});
