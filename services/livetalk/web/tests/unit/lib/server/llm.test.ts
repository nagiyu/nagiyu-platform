/**
 * @jest-environment node
 */
import { getLLMClient, setLLMClientForTesting } from '@/lib/server/llm';
import type { ILLMClient } from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createLLMClient: jest.fn(() => mockLLMInstance),
}));

const mockLLMInstance: ILLMClient = {
  chatStream: jest.fn(),
  chatComplete: jest.fn(),
};

describe('getLLMClient', () => {
  afterEach(() => {
    setLLMClientForTesting(null);
  });

  it('呼び出すと ILLMClient インスタンスを返す', () => {
    const client = getLLMClient();
    expect(client).toBeDefined();
    expect(typeof client.chatStream).toBe('function');
  });

  it('複数回呼んでも同一インスタンスを返す（シングルトン）', () => {
    const c1 = getLLMClient();
    const c2 = getLLMClient();
    expect(c1).toBe(c2);
  });
});

describe('setLLMClientForTesting', () => {
  afterEach(() => {
    setLLMClientForTesting(null);
  });

  it('注入したクライアントが getLLMClient から返される', () => {
    const testClient: ILLMClient = {
      chatStream: jest.fn(),
      chatComplete: jest.fn(),
    };
    setLLMClientForTesting(testClient);
    expect(getLLMClient()).toBe(testClient);
  });

  it('null を渡すとキャッシュがリセットされる', () => {
    setLLMClientForTesting(null);
    const client = getLLMClient();
    expect(client).toBeDefined();
  });
});
