import { buildExplorationAnglePrompt } from '../../../src/research/exploration-angle.prompt.js';

describe('buildExplorationAnglePrompt', () => {
  const base = {
    subject: 'ボカロ',
    canonicalSummary: 'ボーカロイド楽曲',
    selfFactTexts: ['ボカロが好き', '最近ライブに行った'],
    knownWebFactTexts: ['新曲が公開された'],
    recentAngles: ['ボカロ 新作'],
    today: new Date(2026, 0, 5),
  };

  it('system と user のメッセージを返し、user に材料が入る', () => {
    const messages = buildExplorationAnglePrompt(base);

    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    const user = messages[1].content;
    expect(user).toContain('2026-01-05');
    expect(user).toContain('ボカロ');
    expect(user).toContain('ボーカロイド楽曲');
    expect(user).toContain('- ボカロが好き');
    expect(user).toContain('- 最近ライブに行った');
    expect(user).toContain('- 新曲が公開された');
    expect(user).toContain('- ボカロ 新作');
  });

  it('system に一歩広げる指示と重複回避の指示が入る', () => {
    const system = buildExplorationAnglePrompt(base)[0].content;

    expect(system).toContain('一歩広げた');
    expect(system).toContain('重ならない');
    expect(system).toContain('外れてもかまいません');
  });

  it('材料が空のときは (なし) と表示する', () => {
    const user = buildExplorationAnglePrompt({
      ...base,
      canonicalSummary: '',
      selfFactTexts: [],
      knownWebFactTexts: [],
      recentAngles: [],
    })[1].content;

    expect(user.match(/\(なし\)/g)).toHaveLength(4);
  });
});
