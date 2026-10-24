import type { ClipStatus } from '@/types/quick-clip';

/**
 * 見どころの開始・終了、および作り直しの操作を止めるべきかを判定する
 *
 * 作り直しが重なると同じ S3 キーへの書き込みが競合するため、GENERATING の間は操作させない。
 * 更新を送った直後はサーバーの応答で clipStatus が変わるまで間があくので、
 * 送信中も止めて続けて送れないようにする。
 *
 * @param clipStatus - 見どころの現在のクリップ状態
 * @param isSubmitting - この見どころへの更新を送信中か
 * @returns 操作を止めるべきとき true
 */
export function isClipEditLocked(clipStatus: ClipStatus, isSubmitting: boolean): boolean {
  return isSubmitting || clipStatus === 'GENERATING';
}
