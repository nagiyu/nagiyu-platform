/**
 * バッチジョブステータス判定ユーティリティ
 *
 * マイリスト登録結果に基づいてバッチジョブの最終ステータスを決定する。
 * @nagiyu/niconico-mylist-assistant-core の BatchStatus 型のうち、
 * 完了系ステータス（'SUCCEEDED' | 'FAILED'）のみを扱う純粋関数を提供する。
 */

/**
 * バッチジョブの完了ステータス型
 *
 * BatchStatus（'SUBMITTED' | 'RUNNING' | 'WAITING_FOR_2FA' | 'SUCCEEDED' | 'FAILED'）の
 * 完了系サブセット。
 */
export type BatchJobFinalStatus = 'SUCCEEDED' | 'FAILED';

/**
 * マイリスト登録結果からバッチジョブの最終ステータスを決定する
 *
 * 判定ルール:
 * - 全件失敗（successCount === 0 かつ failedCount > 0）→ 'FAILED'
 * - それ以外（全件成功・一部失敗・0件）→ 'SUCCEEDED'
 *   ※一部失敗は UI が SUCCEEDED/FAILED の二値しか扱えないため SUCCEEDED 扱い
 *
 * @param successCount - 登録成功件数
 * @param failedCount - 登録失敗件数
 * @returns バッチジョブの最終ステータス
 */
export function determineBatchJobStatus(
  successCount: number,
  failedCount: number
): BatchJobFinalStatus {
  if (successCount === 0 && failedCount > 0) {
    return 'FAILED';
  }
  return 'SUCCEEDED';
}
