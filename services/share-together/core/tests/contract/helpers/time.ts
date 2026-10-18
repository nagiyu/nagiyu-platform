/**
 * 契約スペックが共有する時刻まわりのヘルパー
 */

/** 旧形式のアイテムに入れる作成日時（エポックミリ秒） */
export const LEGACY_CREATED_AT = Date.UTC(2024, 0, 1, 0, 0, 0);

/** 旧形式のアイテムに入れる更新日時（エポックミリ秒） */
export const LEGACY_UPDATED_AT = Date.UTC(2024, 0, 2, 0, 0, 0);

/** 旧形式は時刻を ISO 文字列で保存していたため、ミリ秒をその形に直す */
export function toLegacyTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/** 更新日時が同じミリ秒に収まらないよう、少しだけ待つ */
export async function waitForTimestampAdvance(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
