import { LLMExplorationAngleGenerator } from '../../../src/research/exploration-angle-generator.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { ExplorationAnglePromptInput } from '../../../src/research/exploration-angle.prompt.js';

function makeLLMClient(impl: (...args: unknown[]) => Promise<unknown>): ILLMClient {
  return {
    chatStream: jest.fn(),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(impl),
  } as unknown as ILLMClient;
}

const input: ExplorationAnglePromptInput = {
  subject: 'ボカロ',
  canonicalSummary: 'ボーカロイド楽曲',
  selfFactTexts: ['ボカロが好き'],
  knownWebFactTexts: ['新曲が公開された'],
  recentAngles: ['ボカロ 新作'],
  today: new Date(2026, 10, 9),
};

describe('LLMExplorationAngleGenerator', () => {
  it('LLM が返したクエリを trim して返す', async () => {
    const llmClient = makeLLMClient(async () => ({ query: '  ボカロ ライブ 2026 ' }));

    const result = await new LLMExplorationAngleGenerator(llmClient).generate(input);

    expect(result).toBe('ボカロ ライブ 2026');
    expect(llmClient.chatStructured).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({ purpose: 'classify' })
    );
  });

  it('LLM 呼び出しが失敗した場合は null を返す', async () => {
    const llmClient = makeLLMClient(async () => {
      throw new Error('API エラー');
    });

    expect(await new LLMExplorationAngleGenerator(llmClient).generate(input)).toBeNull();
  });

  it('空のクエリが返った場合は null を返す', async () => {
    const llmClient = makeLLMClient(async () => ({ query: '   ' }));

    expect(await new LLMExplorationAngleGenerator(llmClient).generate(input)).toBeNull();
  });

  it('プロンプトに材料が入る', async () => {
    const llmClient = makeLLMClient(async () => ({ query: 'ボカロ ライブ 2026' }));

    await new LLMExplorationAngleGenerator(llmClient).generate(input);

    const [messages] = (llmClient.chatStructured as jest.Mock).mock.calls[0];
    const combined = messages.map((m: { content: string }) => m.content).join('\n');
    expect(combined).toContain('ボカロ');
    expect(combined).toContain('ボーカロイド楽曲');
    expect(combined).toContain('ボカロが好き');
    expect(combined).toContain('新曲が公開された');
    expect(combined).toContain('ボカロ 新作');
    expect(combined).toContain('2026-11-09');
  });
});
