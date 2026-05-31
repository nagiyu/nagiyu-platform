import type { Tier } from '@nagiyu/livetalk-core';

/**
 * 記憶 API の入力バリデーション。
 *
 * UI 層・API 層の双方から呼べるよう純粋関数として `lib/` に切り出す
 * （カバレッジ計測対象は `src/lib/**` のみ）。
 */

// TIERS を livetalk-core からランタイムインポートすると @nagiyu/aws → node:crypto が
// クライアントバンドルに混入するため、ここで値を複製して依存を断つ。
const TIERS: readonly Tier[] = ['A', 'B', 'C', 'D'] as const;

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
