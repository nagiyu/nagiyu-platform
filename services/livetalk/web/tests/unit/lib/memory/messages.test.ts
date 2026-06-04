import { MEMORY_DELETE_ANNOTATION, MEMORY_PAGE_GUIDANCE } from '@/lib/memory/messages';

describe('MEMORY_DELETE_ANNOTATION', () => {
  it('即時反映されないことを説明する文言を含む', () => {
    expect(MEMORY_DELETE_ANNOTATION).toContain('すぐ反映されない');
  });

  it('会話による訂正を案内する', () => {
    expect(MEMORY_DELETE_ANNOTATION).toContain('話しかけて');
  });
});

describe('MEMORY_PAGE_GUIDANCE', () => {
  it('会話での訂正を案内する', () => {
    expect(MEMORY_PAGE_GUIDANCE).toContain('話しかけて');
  });
});
