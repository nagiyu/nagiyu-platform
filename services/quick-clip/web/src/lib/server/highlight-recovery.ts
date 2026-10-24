import type { Highlight } from '@/types/quick-clip';

/**
 * クリップ作り直しの Lambda のタイムアウト (ミリ秒)
 *
 * これを過ぎれば Lambda はもう動いていないため、GENERATING のまま残っている見どころは
 * 強制終了などで失敗時の処理が走らなかったものと判断できる。
 * Lambda のタイムアウト設定と同じ値に保つ。
 */
export const CLIP_REGENERATE_TIMEOUT_MS = 300 * 1000;

/**
 * GENERATING のまま止まっている見どころを選び出す
 *
 * GENERATING にした時刻が無いデータは、いつから GENERATING なのか判断できず、
 * 作り直しの最中のものを誤って失敗扱いにしかねないため対象にしない。
 *
 * @param highlights - ジョブの見どころ
 * @param now - 現在時刻 (ミリ秒)
 * @returns タイムアウトを過ぎても GENERATING のままの見どころ
 */
export function findStuckGeneratingHighlights(highlights: Highlight[], now: number): Highlight[] {
  return highlights.filter(
    (highlight) =>
      highlight.clipStatus === 'GENERATING' &&
      highlight.clipGeneratingStartedAt !== undefined &&
      now - highlight.clipGeneratingStartedAt > CLIP_REGENERATE_TIMEOUT_MS
  );
}
