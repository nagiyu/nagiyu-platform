import type { NoteKey } from '@nagiyu/livetalk-core';
import { decodeNoteId, encodeNoteId } from '@/lib/notes/note-id';

const baseKey: NoteKey = {
  userId: 'user-1',
  characterId: 'hiyori',
  noteId: '01HZZ0000000000000000000AB',
};

describe('encodeNoteId / decodeNoteId', () => {
  it('encode した ID は decode で元のキー（userId は引数優先）に戻る', () => {
    const id = encodeNoteId(baseKey);
    const decoded = decodeNoteId(id, baseKey.userId);
    expect(decoded).toEqual(baseKey);
  });

  it('decode は引数の userId を使い、SK には userId を含めない', () => {
    const id = encodeNoteId(baseKey);
    const decoded = decodeNoteId(id, 'another-user');
    expect(decoded?.userId).toBe('another-user');
    expect(decoded?.characterId).toBe('hiyori');
    expect(decoded?.noteId).toBe(baseKey.noteId);
  });

  it('encode は base64url（+ / = を含まない）', () => {
    const id = encodeNoteId(baseKey);
    expect(id).not.toMatch(/[+/=]/);
  });

  it('不正な base64url は null を返す', () => {
    // CHAR# で始まらない SK
    const notChar = Buffer.from('USER#x#NOTE#1', 'utf-8').toString('base64url');
    expect(decodeNoteId(notChar, 'user-1')).toBeNull();
  });

  it('NOTE 以外の SK は null を返す', () => {
    const memSk = Buffer.from('CHAR#hiyori#MEM#B#food#1', 'utf-8').toString('base64url');
    expect(decodeNoteId(memSk, 'user-1')).toBeNull();
  });

  it('パーツ数が不正な SK は null を返す', () => {
    const broken = Buffer.from('CHAR#hiyori#NOTE', 'utf-8').toString('base64url');
    expect(decodeNoteId(broken, 'user-1')).toBeNull();
  });

  it('characterId / noteId が空の SK は null を返す', () => {
    const empty = Buffer.from('CHAR##NOTE#', 'utf-8').toString('base64url');
    expect(decodeNoteId(empty, 'user-1')).toBeNull();
  });
});
