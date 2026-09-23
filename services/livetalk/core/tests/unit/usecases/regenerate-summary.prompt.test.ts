import { buildRegenerateSummaryPrompt } from '../../../src/usecases/regenerate-summary.prompt.js';

describe('buildRegenerateSummaryPrompt', () => {
  it('subject・SELF fact・WEB fact が含まれる', () => {
    const messages = buildRegenerateSummaryPrompt({
      subject: 'コーヒー',
      selfFacts: ['朝コーヒーを飲む'],
      webFacts: ['カフェインは覚醒作用がある'],
    });

    const text = JSON.stringify(messages);
    expect(text).toContain('コーヒー');
    expect(text).toContain('朝コーヒーを飲む');
    expect(text).toContain('カフェインは覚醒作用がある');
  });

  it('削除済み内容を復元しない旨の指示が含まれる', () => {
    const messages = buildRegenerateSummaryPrompt({
      subject: 'コーヒー',
      selfFacts: [],
      webFacts: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('削除済みの内容は決して復元しない');
  });

  it('selfFacts/webFacts が空なら「なし」と表示する', () => {
    const messages = buildRegenerateSummaryPrompt({
      subject: 'コーヒー',
      selfFacts: [],
      webFacts: [],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('なし');
  });

  it('characterName を指定するとプロンプトに反映される', () => {
    const messages = buildRegenerateSummaryPrompt({
      characterName: '桃瀬ひより',
      subject: 'コーヒー',
      selfFacts: ['朝コーヒーを飲む'],
      webFacts: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('桃瀬ひよりが');
  });

  it('system + user の 2 メッセージを返す', () => {
    const messages = buildRegenerateSummaryPrompt({
      subject: 'コーヒー',
      selfFacts: [],
      webFacts: [],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });
});
