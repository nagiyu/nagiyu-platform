import { buildSummarizePrompt } from '../../../../src/llm-client/prompts/summarize.prompt.js';
import type { SummarizeInput } from '../../../../src/llm-client/types.js';

/** テスト用の基本入力 */
const baseInput: SummarizeInput = {
  existingSummary: undefined,
  newMessages: [
    { role: 'user', text: 'コーヒーが好きだよ' },
    { role: 'assistant', text: 'そうなんだね！' },
  ],
  characterName: 'ひより',
};

describe('buildSummarizePrompt', () => {
  describe('汚染防止セクション', () => {
    it('「要約に含めないもの（汚染防止）」セクションが含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('要約に含めないもの（汚染防止）');
    });

    it('キャラの口調・口癖の除外指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('キャラの口調・文体・口癖');
    });

    it('寝ぼけ演出スキップ指示（「むにゃ」「うとうと」の具体例）が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('むにゃ');
      expect(prompt).toContain('うとうと');
    });

    it('寝ぼけ演出・時間帯演出の除外指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('寝ぼけ演出・時間帯演出に由来する一時的な表現');
    });
  });

  describe('要約に含めるもの', () => {
    it('ユーザーの嗜好・興味・話題の抽出指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('要約に含めるもの');
      expect(prompt).toContain('ユーザーの嗜好・興味・話題');
    });

    it('関係性の変化の記録指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('ユーザーとキャラの関係性の変化');
    });

    it('確定した事実・約束・予定の記録指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('会話で確定した事実・約束・予定');
    });
  });

  describe('interestCategories 抽出ルール', () => {
    it('interestCategories の抽出ルールセクションが含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('interestCategories の抽出ルール');
    });

    it('bidirectionalityScore の指示が含まれる', () => {
      const prompt = buildSummarizePrompt(baseInput);
      expect(prompt).toContain('bidirectionalityScore');
    });
  });

  describe('characterName の埋め込み', () => {
    it('characterName がプロンプト冒頭に埋め込まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, characterName: '桃瀬ひより' });
      expect(prompt).toContain('桃瀬ひより');
    });

    it('bidirectionalityScore の指示に characterName が含まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, characterName: 'テストキャラ' });
      expect(prompt).toContain('テストキャラ の発話に反応・質問返しをした割合');
    });
  });

  describe('existingSummary の有無による分岐', () => {
    it('existingSummary が undefined のとき「既存の要約：なし」が含まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, existingSummary: undefined });
      expect(prompt).toContain('既存の要約：なし');
    });

    it('existingSummary が空文字のとき「既存の要約：なし」が含まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, existingSummary: '' });
      expect(prompt).toContain('既存の要約：なし');
    });

    it('existingSummary が有るとき本文が含まれる', () => {
      const prompt = buildSummarizePrompt({
        ...baseInput,
        existingSummary: '過去にコーヒーが好きと話した',
      });
      expect(prompt).toContain('既存の要約：\n過去にコーヒーが好きと話した');
      expect(prompt).not.toContain('既存の要約：なし');
    });
  });

  describe('existingInterestCategories の有無による分岐', () => {
    it('existingInterestCategories が未指定のとき「既存の興味カテゴリ一覧：なし」が含まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, existingInterestCategories: undefined });
      expect(prompt).toContain('既存の興味カテゴリ一覧：なし');
    });

    it('existingInterestCategories が空配列のとき「既存の興味カテゴリ一覧：なし」が含まれる', () => {
      const prompt = buildSummarizePrompt({ ...baseInput, existingInterestCategories: [] });
      expect(prompt).toContain('既存の興味カテゴリ一覧：なし');
    });

    it('existingInterestCategories が有るとき箇条書きで含まれる', () => {
      const prompt = buildSummarizePrompt({
        ...baseInput,
        existingInterestCategories: ['コーヒー', '映画'],
      });
      expect(prompt).toContain('- コーヒー');
      expect(prompt).toContain('- 映画');
      expect(prompt).toContain('既存の興味カテゴリ一覧（同義のものはこの表記を再利用すること）');
    });
  });

  describe('newMessages の role 変換', () => {
    it('role=user が「ユーザー」に変換される', () => {
      const prompt = buildSummarizePrompt({
        ...baseInput,
        newMessages: [{ role: 'user', text: 'テストメッセージ' }],
      });
      expect(prompt).toContain('ユーザー: テストメッセージ');
    });

    it('role=assistant が characterName に変換される', () => {
      const prompt = buildSummarizePrompt({
        ...baseInput,
        characterName: 'ひより',
        newMessages: [{ role: 'assistant', text: 'よろしくね！' }],
      });
      expect(prompt).toContain('ひより: よろしくね！');
    });

    it('user と assistant が混在する場合、両方が正しく変換される', () => {
      const prompt = buildSummarizePrompt({
        ...baseInput,
        characterName: 'ひより',
        newMessages: [
          { role: 'user', text: 'こんにちは' },
          { role: 'assistant', text: 'こんにちは！' },
        ],
      });
      expect(prompt).toContain('ユーザー: こんにちは');
      expect(prompt).toContain('ひより: こんにちは！');
    });
  });
});
