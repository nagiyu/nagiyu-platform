import type { Tier } from '@nagiyu/livetalk-core';

// TIERS を livetalk-core からランタイムインポートすると @nagiyu/aws → node:crypto が
// クライアントバンドルに混入するため、ここで値を複製して依存を断つ。
const TIERS: readonly Tier[] = ['A', 'B', 'C', 'D'] as const;
import type { MemoryPatchInput } from './types';

/**
 * 記憶編集 UI / API の入力バリデーション。
 *
 * UI 層・API 層の双方から呼べるよう純粋関数として `lib/` に切り出す
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

/** content の最大文字数。LLM プロンプトに注入されるため過度に長い記憶を弾く。 */
export const MEMORY_CONTENT_MAX_LENGTH = 500;

/** category の最大文字数。SK の一部になるため短く保つ。 */
export const MEMORY_CATEGORY_MAX_LENGTH = 50;

/**
 * category に使える文字（英小文字・数字・ハイフン・アンダースコア）。
 * SK 区切り文字 `#` の混入を防ぐため厳格に制限する。
 */
const CATEGORY_PATTERN = /^[a-z0-9_-]+$/;

export interface ValidatedMemoryPatch {
  content?: string;
  category?: string;
}

export type PatchValidationError =
  | 'EMPTY_PATCH'
  | 'INVALID_CONTENT'
  | 'CONTENT_TOO_LONG'
  | 'INVALID_CATEGORY'
  | 'CATEGORY_TOO_LONG';

export type PatchValidationResult =
  | { ok: true; value: ValidatedMemoryPatch }
  | { ok: false; error: PatchValidationError };

/**
 * 任意の値が PATCH リクエストの形を満たすか検証する。
 *
 * - content / category の少なくとも一方が必要
 * - content は空白のみを許さず、最大長を超えない
 * - category は許可文字のみ・最大長を超えない
 */
export function validateMemoryPatch(body: unknown): PatchValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'EMPTY_PATCH' };
  }

  const input = body as MemoryPatchInput;
  const result: ValidatedMemoryPatch = {};

  if (input.content !== undefined) {
    if (typeof input.content !== 'string') {
      return { ok: false, error: 'INVALID_CONTENT' };
    }
    const trimmed = input.content.trim();
    if (!trimmed) {
      return { ok: false, error: 'INVALID_CONTENT' };
    }
    if (trimmed.length > MEMORY_CONTENT_MAX_LENGTH) {
      return { ok: false, error: 'CONTENT_TOO_LONG' };
    }
    result.content = trimmed;
  }

  if (input.category !== undefined) {
    if (typeof input.category !== 'string') {
      return { ok: false, error: 'INVALID_CATEGORY' };
    }
    const trimmed = input.category.trim();
    if (trimmed.length > MEMORY_CATEGORY_MAX_LENGTH) {
      return { ok: false, error: 'CATEGORY_TOO_LONG' };
    }
    if (!CATEGORY_PATTERN.test(trimmed)) {
      return { ok: false, error: 'INVALID_CATEGORY' };
    }
    result.category = trimmed;
  }

  if (result.content === undefined && result.category === undefined) {
    return { ok: false, error: 'EMPTY_PATCH' };
  }

  return { ok: true, value: result };
}

/**
 * クエリパラメータの tier 文字列を検証する。未指定（null）は許容する。
 *
 * UI には Tier A/B/C のみ出すが（D は一時的なので非表示）、検証自体は
 * エンティティ定義の TIERS を正とする。
 */
export function parseTierQuery(
  raw: string | null
): { ok: true; tier: Tier | null } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, tier: null };
  if (TIERS.includes(raw as Tier)) return { ok: true, tier: raw as Tier };
  return { ok: false };
}

/** UI に表示する Tier（D は一時的なので除外）。 */
export const VISIBLE_TIERS: readonly Tier[] = ['A', 'B', 'C'] as const;
