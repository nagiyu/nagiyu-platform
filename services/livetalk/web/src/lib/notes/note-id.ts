import { buildNoteSK, type NoteKey } from '@nagiyu/livetalk-core';

/**
 * Note の完全 SK を URL 安全な ID（base64url）にエンコード／デコードするユーティリティ。
 *
 * DynamoDB の SK は `CHAR#<characterId>#NOTE#<noteId>` で `#` を含むため API パスに
 * そのまま乗せられない。記憶 UI（`lib/memory/memory-id.ts`）と同じ方針で完全 SK を
 * base64url エンコードして `:id` として扱い、サーバ側で `NoteKey` に復元する。
 */

const SK_PREFIX = 'CHAR#';

function toBase64Url(input: string): string {
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(input, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(input)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(normalized)));
}

/**
 * NoteKey から API パス用の ID（base64url）を生成する。
 */
export function encodeNoteId(key: NoteKey): string {
  const sk = buildNoteSK(key.characterId, key.noteId);
  return toBase64Url(sk);
}

/**
 * API パス用の ID を NoteKey に復元する。
 *
 * @param id base64url エンコードされた完全 SK
 * @param userId 認可済みセッションの userId（PK 側はクライアント入力を信用しない）
 * @returns 復元した NoteKey。不正な形式なら null
 */
export function decodeNoteId(id: string, userId: string): NoteKey | null {
  let sk: string;
  try {
    sk = fromBase64Url(id);
  } catch {
    return null;
  }

  if (!sk.startsWith(SK_PREFIX)) return null;

  // `CHAR#<characterId>#NOTE#<noteId>`
  // characterId / noteId に `#` は含まれない前提で分割する。
  const parts = sk.split('#');
  if (parts.length !== 4) return null;

  const [, characterId, note, noteId] = parts;
  if (note !== 'NOTE') return null;
  if (!characterId || !noteId) return null;

  return { userId, characterId, noteId };
}
