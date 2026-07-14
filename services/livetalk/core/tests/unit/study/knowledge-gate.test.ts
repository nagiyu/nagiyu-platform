import { classifyTopic } from '../../../src/study/knowledge-gate.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';

// ── ヘルパー ──────────────────────────────────────────────────────────────

function makeLLMClient(result: { needsStudy: boolean; normalizedTopic: string }): ILLMClient {
  return {
    chatStream: jest.fn(async function* () {
      yield '';
    }),
    chatComplete: jest.fn(),
    chatStructured: jest.fn(async () => result) as unknown as ILLMClient['chatStructured'],
  };
}

// ── classifyTopic ─────────────────────────────────────────────────────────

describe('classifyTopic', () => {
  it('needsStudy=true を返す場合（時事・ニッチ）', async () => {
    const llm = makeLLMClient({ needsStudy: true, normalizedTopic: '最新ニュース' });
    const result = await classifyTopic('最新ニュース教えて', 'ひより', llm);
    expect(result.needsStudy).toBe(true);
    expect(result.normalizedTopic).toBe('最新ニュース');
  });

  it('needsStudy=false を返す場合（一般常識）', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: '日本の首都' });
    const result = await classifyTopic('日本の首都ってどこ？', 'ひより', llm);
    expect(result.needsStudy).toBe(false);
  });

  it('chatStructured を purpose=classify で呼び出す', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: '挨拶' });
    await classifyTopic('おはよう', 'ひより', llm);
    expect(llm.chatStructured).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'おはよう' })]),
      expect.anything(),
      expect.objectContaining({ purpose: 'classify' })
    );
  });

  // ── 問題B の回帰: プロンプトがユーザー自身の質問を勉強対象から除外している ──
  it('system プロンプトがユーザー自身に関する質問を needsStudy=false と明示している', async () => {
    const llm = makeLLMClient({ needsStudy: false, normalizedTopic: 'x' });
    await classifyTopic('俺の好きな飲み物って覚えてる？', 'ひより', llm);
    const calledMessages = (llm.chatStructured as jest.Mock).mock.calls[0][0] as Array<{
      role: string;
      content: string;
    }>;
    const system = calledMessages.find((m) => m.role === 'system')?.content ?? '';
    // 「ユーザー自身のこと」「記憶」「false」という方針が含まれていること
    expect(system).toContain('ユーザー自身');
    expect(system).toContain('記憶');
    expect(system).toMatch(/false/);
    // Web で調べられるかを判断基準にしていること
    expect(system).toContain('検索');
  });
});
