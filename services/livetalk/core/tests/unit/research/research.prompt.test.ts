import { buildResearchPrompt } from '../../../src/research/research.prompt.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';

/** テスト用キャラクター定義 */
const character: CharacterDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  notificationName: 'ひより',
  personality: {
    basePrompt: '',
    speechStyle: '優しく丁寧な口調',
    preferences: {
      likes: ['コーヒー', '読書', '猫'],
      dislikes: [],
    },
  },
  voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
  license: { displayText: '', creditName: '' },
};

describe('buildResearchPrompt', () => {
  describe('character.displayName の埋め込み', () => {
    it('displayName がプロンプト冒頭（「あなたは〜です」）に含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain(`あなたは「${character.displayName}」です。`);
    });

    it('rawComment の指示に displayName が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain(`${character.displayName} として一言コメント`);
    });

    it('Web 検索指示に displayName が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain(`${character.displayName} らしい視点で内容を要約してください`);
    });
  });

  describe('query の埋め込み', () => {
    it('query 文字列がプロンプトに含まれる', () => {
      const prompt = buildResearchPrompt('最新のコーヒートレンド', character);
      expect(prompt).toContain('最新のコーヒートレンド');
    });

    it('別の query でも正しく埋め込まれる', () => {
      const prompt = buildResearchPrompt('おすすめのアニメ', character);
      expect(prompt).toContain('おすすめのアニメ');
    });
  });

  describe('speechStyle の埋め込み', () => {
    it('口調・性格の指示が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain(`口調・性格：${character.personality.speechStyle}`);
    });
  });

  describe('likes の埋め込み', () => {
    it('好きなものが「、」で結合されて含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('好きなもの：コーヒー、読書、猫');
    });

    it('likes が 1 件の場合も「、」なしで含まれる', () => {
      const singleLikeCharacter: CharacterDefinition = {
        ...character,
        personality: {
          ...character.personality,
          preferences: { likes: ['映画'], dislikes: [] },
        },
      };
      const prompt = buildResearchPrompt('映画', singleLikeCharacter);
      expect(prompt).toContain('好きなもの：映画');
    });
  });

  describe('返す項目（JSON）の指示', () => {
    it('topic の指示が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('- topic:');
    });

    it('summary の指示が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('- summary:');
    });

    it('sourceUrls の指示が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('- sourceUrls:');
    });

    it('rawComment の指示が含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('- rawComment:');
    });

    it('「返す項目（JSON）」の見出しが含まれる', () => {
      const prompt = buildResearchPrompt('コーヒー', character);
      expect(prompt).toContain('返す項目（JSON）:');
    });
  });
});
