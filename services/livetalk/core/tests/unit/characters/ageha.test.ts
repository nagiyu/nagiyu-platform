import { ageha } from '../../../src/characters/ageha.js';

/**
 * 早瀬アゲハ の CharacterDefinition 検証テスト。
 *
 * キャラ定義の整合性（ID・displayName・voiceConfig・personality・license）を
 * 仕様通りに実装されていることを確認する。
 */
describe('早瀬アゲハ CharacterDefinition', () => {
  describe('基本情報', () => {
    it('id が "ageha" である', () => {
      expect(ageha.id).toBe('ageha');
    });

    it('displayName が "早瀬アゲハ" である', () => {
      expect(ageha.displayName).toBe('早瀬アゲハ');
    });
  });

  describe('voiceConfig', () => {
    it('provider が "openai" である', () => {
      expect(ageha.voiceConfig.provider).toBe('openai');
    });

    it('voice が "nova" である', () => {
      if (ageha.voiceConfig.provider === 'openai') {
        expect(ageha.voiceConfig.voice).toBe('nova');
      } else {
        fail('provider が openai でない');
      }
    });

    it('instructions が設定されている', () => {
      if (ageha.voiceConfig.provider === 'openai') {
        expect(ageha.voiceConfig.instructions).toBeDefined();
        expect(typeof ageha.voiceConfig.instructions).toBe('string');
        expect((ageha.voiceConfig.instructions as string).length).toBeGreaterThan(0);
      } else {
        fail('provider が openai でない');
      }
    });
  });

  describe('personality', () => {
    it('basePrompt が設定されている（日本語を含む）', () => {
      expect(ageha.personality.basePrompt).toBeTruthy();
      // 日本語文字が含まれる
      expect(ageha.personality.basePrompt).toMatch(/[ぁ-ん]/);
    });

    it('basePrompt に「早瀬アゲハ」が含まれる', () => {
      expect(ageha.personality.basePrompt).toContain('早瀬アゲハ');
    });

    it('speechStyle が設定されている', () => {
      expect(ageha.personality.speechStyle).toBeTruthy();
      expect(typeof ageha.personality.speechStyle).toBe('string');
    });

    it('speechStyle に一人称「ウチ」が含まれる', () => {
      expect(ageha.personality.speechStyle).toContain('ウチ');
    });

    it('likes が 1 件以上ある', () => {
      expect(ageha.personality.preferences.likes.length).toBeGreaterThan(0);
    });

    it('dislikes が 1 件以上ある', () => {
      expect(ageha.personality.preferences.dislikes.length).toBeGreaterThan(0);
    });

    it('likes の各要素が空でない文字列である', () => {
      for (const like of ageha.personality.preferences.likes) {
        expect(typeof like).toBe('string');
        expect(like.length).toBeGreaterThan(0);
      }
    });

    it('dislikes の各要素が空でない文字列である', () => {
      for (const dislike of ageha.personality.preferences.dislikes) {
        expect(typeof dislike).toBe('string');
        expect(dislike.length).toBeGreaterThan(0);
      }
    });
  });

  describe('license', () => {
    it('displayText が設定されている', () => {
      expect(ageha.license.displayText).toBeTruthy();
      expect(typeof ageha.license.displayText).toBe('string');
    });

    it('displayText に AI 生成音声であることの明示が含まれる', () => {
      // OpenAI 利用規約上、AI 生成音声であることの明示は必須
      expect(ageha.license.displayText).toContain('AI 生成音声');
    });

    it('displayText に OpenAI TTS の記述が含まれる', () => {
      expect(ageha.license.displayText).toContain('OpenAI TTS');
    });

    it('creditName が "早瀬アゲハ" である', () => {
      expect(ageha.license.creditName).toBe('早瀬アゲハ');
    });
  });
});
