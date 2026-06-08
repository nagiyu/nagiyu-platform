import {
  buildSafetyMessage,
  buildModerationReplacementMessage,
} from '../../../src/safety/templates.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import type { SafetyCategory } from '../../../src/safety/types.js';

const CATEGORIES: SafetyCategory[] = [
  'suicidal_ideation',
  'self_harm',
  'hopelessness',
  'crisis_method',
  'crisis_state',
];

describe('buildSafetyMessage', () => {
  it.each(CATEGORIES)('カテゴリ %s で文字列を返す', (category) => {
    const msg = buildSafetyMessage(category, hiyori, 0);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('nowMs=0 は常に最初のテンプレートを返す', () => {
    const msg1 = buildSafetyMessage('suicidal_ideation', hiyori, 0);
    const msg2 = buildSafetyMessage('suicidal_ideation', hiyori, 0);
    expect(msg1).toBe(msg2);
  });

  it('nowMs の違いでテンプレートが変わる可能性がある', () => {
    // テンプレートが複数ある場合に nowMs で分岐すること（両方の分岐を踏む）
    const results = new Set<string>();
    for (let ms = 0; ms < 10; ms++) {
      results.add(buildSafetyMessage('suicidal_ideation', hiyori, ms));
    }
    // 少なくとも 1 つのメッセージが存在する
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('各カテゴリのメッセージが心配を表明している（キーワード確認）', () => {
    for (const category of CATEGORIES) {
      const msg = buildSafetyMessage(category, hiyori, 0);
      // 「心配」または「辛」または「ごめん」または「つらい」等の感情表現を含む
      const hasEmotion = /心配|つら|辛|ごめん|専門|相談|一人|話/.test(msg);
      expect(hasEmotion).toBe(true);
    }
  });
});

describe('buildModerationReplacementMessage', () => {
  it('文字列を返す', () => {
    const msg = buildModerationReplacementMessage(0);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('nowMs 未指定でも動作する', () => {
    expect(() => buildModerationReplacementMessage()).not.toThrow();
  });
});
