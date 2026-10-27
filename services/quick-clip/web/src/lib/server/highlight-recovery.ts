import type { Highlight } from '@/types/quick-clip';

/** クリップ作り直しの Lambda のタイムアウト (ミリ秒) */
const CLIP_REGENERATE_LAMBDA_TIMEOUT_MS = 300 * 1000;

/**
 * Lambda のタイムアウトに足す余裕 (ミリ秒)
 *
 * 非同期の起動はキューで待ってから動き出し、GENERATING の時刻は Web が起動を頼んだ時点で
 * 記録するため、Lambda が実際に動き始めるのはそれより後になる。
 * タイムアウトちょうどで見切ると、まだ動いている Lambda の作り直しを失敗扱いにしかねない。
 */
const CLIP_GENERATING_MARGIN_MS = 60 * 1000;

/**
 * GENERATING にしてから、止まったとみなすまでの時間 (ミリ秒)
 *
 * これを過ぎれば Lambda はもう動いていないため、GENERATING のまま残っている見どころは
 * 強制終了などで失敗時の処理が走らなかったものと判断できる。
 */
export const CLIP_GENERATING_STALE_MS =
  CLIP_REGENERATE_LAMBDA_TIMEOUT_MS + CLIP_GENERATING_MARGIN_MS;

/**
 * GENERATING のまま止まっている見どころを選び出す
 *
 * GENERATING にした時刻が無いデータは、いつから GENERATING なのか判断できず、
 * 作り直しの最中のものを誤って失敗扱いにしかねないため対象にしない。
 *
 * @param highlights - ジョブの見どころ
 * @param now - 現在時刻 (ミリ秒)
 * @returns 止まったとみなす時間を過ぎても GENERATING のままの見どころ
 */
export function findStuckGeneratingHighlights(highlights: Highlight[], now: number): Highlight[] {
  return highlights.filter(
    (highlight) =>
      highlight.clipStatus === 'GENERATING' &&
      highlight.clipGeneratingStartedAt !== undefined &&
      now - highlight.clipGeneratingStartedAt > CLIP_GENERATING_STALE_MS
  );
}
