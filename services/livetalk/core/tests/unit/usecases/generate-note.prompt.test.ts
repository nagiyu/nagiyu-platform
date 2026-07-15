import { buildGenerateNotePrompt } from '../../../src/usecases/generate-note.prompt.js';

/**
 * ノート生成プロンプトの「厳守ルール」文言が欠落していないことを検証する
 * （リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）。
 *
 * 捏造禁止・センシティブ SELF 回避の enforcement は完全にプロンプト文字列に依存するため、
 * 将来の編集でルールが静かに欠落しても検知できるよう、核となる文言をアサーションで固定する。
 */
describe('buildGenerateNotePrompt', () => {
  const baseInput = {
    characterName: 'ひより',
    subject: 'コーヒーの効能',
    canonicalSummary: 'コーヒーには覚醒作用がある',
    selfFacts: [{ text: 'コーヒーが好き', provenance: '雑談' }],
    webFacts: [{ text: '覚醒効果がある', sourceUrls: ['https://example.com/a'] }],
  };

  it('system メッセージに捏造禁止ルールを含む', () => {
    const [system] = buildGenerateNotePrompt(baseInput);
    expect(system.role).toBe('system');
    expect(system.content).toContain('捏造禁止');
    // 実在の SELF 根拠がある時のみ強フック、弱ければ自発トーンへ逃がす旨
    expect(system.content).toContain('実在する根拠がある時のみ');
    expect(system.content).toContain('自発トーン');
    expect(system.content).toContain('usedSelfHook');
  });

  it('system メッセージにセンシティブ SELF 回避ルールを含む', () => {
    const [system] = buildGenerateNotePrompt(baseInput);
    expect(system.content).toContain('センシティブ');
    // 監視っぽさ回避の趣旨
    expect(system.content).toContain('監視');
  });

  it('WEB を主役にし箇条書きの羅列にしない・skip 指示を含む', () => {
    const [system] = buildGenerateNotePrompt(baseInput);
    expect(system.content).toContain('手紙');
    expect(system.content).toContain('skip');
  });

  it('SELF/WEB が空でも「なし」で組み立てられる', () => {
    const [, user] = buildGenerateNotePrompt({
      ...baseInput,
      selfFacts: [],
      webFacts: [],
    });
    expect(user.role).toBe('user');
    expect(user.content).toContain('なし');
  });

  it('キャラ名・主題・SELF/WEB 本文を埋め込む', () => {
    const [system, user] = buildGenerateNotePrompt(baseInput);
    expect(system.content).toContain('ひより');
    expect(system.content).toContain('コーヒーの効能');
    expect(user.content).toContain('コーヒーが好き');
    expect(user.content).toContain('覚醒効果がある');
  });

  describe('依頼フック（甲-1）', () => {
    it('system メッセージに依頼フックの指示（usedSelfHook は false のまま）を含む', () => {
      const [system] = buildGenerateNotePrompt(baseInput);
      expect(system.content).toContain('依頼フック');
      expect(system.content).toContain('usedRequestHook');
      expect(system.content).toContain('usedSelfHook は');
      expect(system.content).toContain('false のままにしてください');
    });

    it('requestText があれば user メッセージの依頼セクションに反映される', () => {
      const [, user] = buildGenerateNotePrompt({
        ...baseInput,
        selfFacts: [],
        requestText: '最新アニメ情報を調べて',
        requestedAtLabel: '7月10日',
      });
      expect(user.content).toContain('最新アニメ情報を調べて');
      expect(user.content).toContain('7月10日');
    });

    it('requestText が無ければ依頼セクションは「なし」になる', () => {
      const [, user] = buildGenerateNotePrompt(baseInput);
      expect(user.content).toContain('ユーザーの依頼（あれば）：\nなし');
    });
  });
});
