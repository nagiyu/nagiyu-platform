import { formatNoteDate, getNoteEmptyMessage, getNotePageGuidance } from '@/lib/notes/messages';

describe('getNotePageGuidance', () => {
  it('ノートに関するガイダンス文言を含む', () => {
    expect(getNotePageGuidance()).toContain('ノート');
  });

  it('characterId 未指定時は既定キャラクター（ひより）の shortName を使う', () => {
    expect(getNotePageGuidance()).toContain('ひより');
  });

  it('characterId に ageha を指定すると「アゲハ」を含む文言を返す', () => {
    expect(getNotePageGuidance('ageha')).toContain('アゲハ');
  });

  it('ageha の文言は「ひより」を含まない', () => {
    expect(getNotePageGuidance('ageha')).not.toContain('ひより');
  });
});

describe('getNoteEmptyMessage', () => {
  it('ノートに関する空状態メッセージを含む', () => {
    expect(getNoteEmptyMessage()).toContain('ノート');
  });

  it('characterId 未指定時は既定キャラクター（ひより）の shortName を使う', () => {
    expect(getNoteEmptyMessage()).toContain('ひより');
  });

  it('characterId に ageha を指定すると「アゲハ」を含む文言を返す', () => {
    expect(getNoteEmptyMessage('ageha')).toContain('アゲハ');
  });

  it('ageha の文言は「ひより」を含まない', () => {
    expect(getNoteEmptyMessage('ageha')).not.toContain('ひより');
  });
});

describe('formatNoteDate', () => {
  it('Unix ms を YYYY年M月D日 形式に整形する', () => {
    // 2025-06-15 をローカルタイムで生成して比較（タイムゾーン非依存）
    const date = new Date(2025, 5, 15, 12, 0, 0);
    expect(formatNoteDate(date.getTime())).toBe('2025年6月15日');
  });
});
