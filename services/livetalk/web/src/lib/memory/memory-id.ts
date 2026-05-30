import { buildMemorySK, type MemoryKey, type Tier, TIERS } from '@nagiyu/livetalk-core';

/**
 * Memory の完全 SK を URL 安全な ID（base64url）にエンコード／デコードするユーティリティ。
 *
 * DynamoDB の SK は `CHAR#<characterId>#MEM#<tier>#<category>#<memoryId>` で、`#` や
 * 可変長の category を含むため API パスにそのまま乗せられない。Issue #3283 の方針どおり
 * 完全 SK を base64url でエンコードして `:id` として扱い、サーバ側で `MemoryKey` に復元する。
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
 * MemoryKey から API パス用の ID（base64url）を生成する。
 */
export function encodeMemoryId(key: MemoryKey): string {
  const sk = buildMemorySK(key.characterId, key.tier, key.category, key.memoryId);
  return toBase64Url(sk);
}

/**
 * API パス用の ID を MemoryKey に復元する。
 *
 * @param id base64url エンコードされた完全 SK
 * @param userId 認可済みセッションの userId（PK 側はクライアント入力を信用しない）
 * @returns 復元した MemoryKey。不正な形式なら null
 */
export function decodeMemoryId(id: string, userId: string): MemoryKey | null {
  let sk: string;
  try {
    sk = fromBase64Url(id);
  } catch {
    return null;
  }

  if (!sk.startsWith(SK_PREFIX)) return null;

  // `CHAR#<characterId>#MEM#<tier>#<category>#<memoryId>`
  // characterId / category / memoryId に `#` は含まれない前提で分割する。
  const parts = sk.split('#');
  if (parts.length !== 6) return null;

  const [, characterId, mem, tier, category, memoryId] = parts;
  if (mem !== 'MEM') return null;
  if (!characterId || !category || !memoryId) return null;
  if (!TIERS.includes(tier as Tier)) return null;

  return {
    userId,
    characterId,
    tier: tier as Tier,
    category,
    memoryId,
  };
}
