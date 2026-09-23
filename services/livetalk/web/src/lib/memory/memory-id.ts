import { buildSelfFactSK, type SelfFactKey } from '@nagiyu/livetalk-core';

/**
 * SELF fact の完全 SK を URL 安全な ID（base64url）にエンコード／デコードするユーティリティ
 * （リブトーク知識再設計 P2 / #3698）。
 *
 * DynamoDB の SK は `CHAR#<characterId>#TOPIC#<topicId>#SELF#<factId>` で、`#` や
 * 可変長のセグメントを含むため API パスにそのまま乗せられない。完全 SK を base64url で
 * エンコードして `:id` として扱い、サーバ側で `SelfFactKey` に復元する。
 */

const SK_PREFIX = 'CHAR#';

/**
 * Node / ブラウザ両対応で base64url エンコードする。
 */
function toBase64Url(input: string): string {
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(input, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(input)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * base64url 文字列をデコードする。不正な入力では例外を投げる。
 */
function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'base64').toString('utf-8');
  }
  return decodeURIComponent(escape(atob(normalized)));
}

/**
 * SelfFactKey から API パス用の ID（base64url）を生成する。
 */
export function encodeSelfFactId(key: SelfFactKey): string {
  const sk = buildSelfFactSK(key.characterId, key.topicId, key.factId);
  return toBase64Url(sk);
}

/**
 * API パス用の ID を SelfFactKey に復元する。
 *
 * @param id base64url エンコードされた完全 SK
 * @param userId 認可済みセッションの userId（PK 側はクライアント入力を信用しない）
 * @returns 復元した SelfFactKey。不正な形式なら null
 */
export function decodeSelfFactId(id: string, userId: string): SelfFactKey | null {
  let sk: string;
  try {
    sk = fromBase64Url(id);
  } catch {
    return null;
  }

  if (!sk.startsWith(SK_PREFIX)) return null;

  // `CHAR#<characterId>#TOPIC#<topicId>#SELF#<factId>`
  // characterId / topicId / factId に `#` は含まれない前提で分割する。
  const parts = sk.split('#');
  if (parts.length !== 6) return null;

  const [, characterId, topic, topicId, self, factId] = parts;
  if (topic !== 'TOPIC') return null;
  if (self !== 'SELF') return null;
  if (!characterId || !topicId || !factId) return null;

  return {
    userId,
    characterId,
    topicId,
    factId,
  };
}
