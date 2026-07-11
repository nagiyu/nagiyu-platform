import { getMemoryDeleteAnnotation, getMemoryPageGuidance } from '@/lib/memory/messages';

describe('getMemoryDeleteAnnotation', () => {
  it('確実に忘れる（決定的削除）ことを説明する文言を含む', () => {
    expect(getMemoryDeleteAnnotation()).toContain('確実に忘れて');
  });

  it('元に戻せないことを説明する', () => {
    expect(getMemoryDeleteAnnotation()).toContain('元には戻せない');
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

  it('削除できることを案内する', () => {
    expect(getMemoryPageGuidance()).toContain('削除');
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
