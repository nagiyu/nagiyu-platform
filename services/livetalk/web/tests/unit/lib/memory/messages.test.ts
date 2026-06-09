import { getMemoryDeleteAnnotation, getMemoryPageGuidance } from '@/lib/memory/messages';

describe('getMemoryDeleteAnnotation', () => {
  it('即時反映されないことを説明する文言を含む', () => {
    expect(getMemoryDeleteAnnotation()).toContain('すぐ反映されない');
  });

  it('会話による訂正を案内する', () => {
    expect(getMemoryDeleteAnnotation()).toContain('話しかけて');
  });

  it('characterId 未指定時は既定キャラクター（ひより）の shortName を使う', () => {
    expect(getMemoryDeleteAnnotation()).toContain('ひより');
  });

  it('characterId に ageha を指定すると「アゲハ」を含む文言を返す', () => {
    expect(getMemoryDeleteAnnotation('ageha')).toContain('アゲハ');
  });

  it('ageha の文言は「ひより」を含まない', () => {
    expect(getMemoryDeleteAnnotation('ageha')).not.toContain('ひより');
  });
});

describe('getMemoryPageGuidance', () => {
  it('会話での訂正を案内する', () => {
    expect(getMemoryPageGuidance()).toContain('話しかけて');
  });

  it('characterId 未指定時は既定キャラクター（ひより）の shortName を使う', () => {
    expect(getMemoryPageGuidance()).toContain('ひより');
  });

  it('characterId に ageha を指定すると「アゲハ」を含む文言を返す', () => {
    expect(getMemoryPageGuidance('ageha')).toContain('アゲハ');
  });

  it('ageha の文言は「ひより」を含まない', () => {
    expect(getMemoryPageGuidance('ageha')).not.toContain('ひより');
  });
});
