import {
  NOTE_EMPTY_MESSAGE,
  NOTE_PAGE_GUIDANCE,
  formatNoteDate,
} from '@/lib/notes/messages';

describe('notes messages', () => {
  it('ガイダンス文言が定義されている', () => {
    expect(NOTE_PAGE_GUIDANCE).toContain('ノート');
    expect(NOTE_EMPTY_MESSAGE).toContain('ノート');
  });
});

describe('formatNoteDate', () => {
  it('Unix ms を YYYY年M月D日 形式に整形する', () => {
    // 2025-06-15 をローカルタイムで生成して比較（タイムゾーン非依存）
    const date = new Date(2025, 5, 15, 12, 0, 0);
    expect(formatNoteDate(date.getTime())).toBe('2025年6月15日');
  });
});
