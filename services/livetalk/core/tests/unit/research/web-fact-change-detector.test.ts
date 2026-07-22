import { LLMWebFactChangeDetector } from '../../../src/research/web-fact-change-detector.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { ResearchResult } from '../../../src/research/types.js';

function makeLLMClient(impl: (...args: unknown[]) => Promise<unknown>): ILLMClient {
  return {
    chatStream: jest.fn(),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(impl),
  } as unknown as ILLMClient;
}

const freshResult: ResearchResult = {
  topic: '桜まつり',
  summary: '今年の桜まつりは4月上旬に開催される予定です。',
  sourceUrls: ['https://example.com'],
  rawComment: '楽しみだね！',
};

describe('LLMWebFactChangeDetector', () => {
  it('LLM が changed:true を返した場合は true を返す', async () => {
    const llmClient = makeLLMClient(async () => ({ changed: true }));
    const detector = new LLMWebFactChangeDetector(llmClient);

    const result = await detector.hasChanged('去年の桜まつりは3月下旬でした。', freshResult);

    expect(result).toBe(true);
    expect(llmClient.chatStructured).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({ purpose: 'classify' })
    );
  });

  it('LLM が changed:false を返した場合は false を返す', async () => {
    const llmClient = makeLLMClient(async () => ({ changed: false }));
    const detector = new LLMWebFactChangeDetector(llmClient);

    const result = await detector.hasChanged(
      '今年の桜まつりは4月上旬に開催される予定です。',
      freshResult
    );

    expect(result).toBe(false);
  });

  it('LLM 呼び出しが失敗した場合は安全側（true）を返す', async () => {
    const llmClient = makeLLMClient(async () => {
      throw new Error('API エラー');
    });
    const detector = new LLMWebFactChangeDetector(llmClient);

    const result = await detector.hasChanged('既知の事実', freshResult);

    expect(result).toBe(true);
  });

  it('プロンプトに既知の事実と新情報の両方を含める', async () => {
    const llmClient = makeLLMClient(async () => ({ changed: false }));
    const detector = new LLMWebFactChangeDetector(llmClient);

    await detector.hasChanged('既知の事実テキスト', freshResult);

    const [messages] = (llmClient.chatStructured as jest.Mock).mock.calls[0];
    const combined = messages.map((m: { content: string }) => m.content).join('\n');
    expect(combined).toContain('既知の事実テキスト');
    expect(combined).toContain(freshResult.summary);
  });
});
