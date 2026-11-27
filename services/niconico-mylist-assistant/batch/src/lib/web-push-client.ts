import { DEFAULT_NOTIFICATION_ICON } from '@nagiyu/common/push';
import type { NotificationPayload } from '@nagiyu/common';

const SESSION_INVALID_NOTIFICATION = {
  TITLE: 'マイリスト登録失敗',
  BODY: 'ニコニコのセッションが無効なため、マイリスト登録を開始できませんでした。セッションを再設定してください',
  // セッション管理がある画面。通知タップ時の遷移先として Service Worker が data.url を参照する
  URL: '/mylist/register',
  TYPE: 'batch-session-invalid',
} as const;

/**
 * バッチ完了通知のペイロードを生成する
 *
 * @param jobId - ジョブID
 * @param registeredCount - 登録成功件数
 * @param failedCount - 登録失敗件数
 * @param totalCount - 総件数
 * @returns 通知ペイロード
 */
export function createBatchCompletionPayload(
  jobId: string,
  registeredCount: number,
  failedCount: number,
  totalCount: number
): NotificationPayload {
  const successRate = totalCount > 0 ? Math.round((registeredCount / totalCount) * 100) : 0;

  let body: string;
  if (failedCount === 0) {
    body = `全 ${totalCount} 件のマイリスト登録が完了しました`;
  } else if (registeredCount === 0) {
    body = `マイリスト登録に失敗しました（${failedCount} 件）`;
  } else {
    body = `${registeredCount} 件登録完了、${failedCount} 件失敗（成功率 ${successRate}%）`;
  }

  return {
    title: 'マイリスト登録完了',
    body,
    icon: DEFAULT_NOTIFICATION_ICON,
    data: {
      jobId,
      registeredCount,
      failedCount,
      totalCount,
      type: 'batch-completion',
    },
  };
}

/**
 * セッション無効でバッチを開始できなかったときの失敗通知のペイロードを生成する
 *
 * @param jobId - ジョブID
 * @returns 通知ペイロード
 */
export function createSessionInvalidPayload(jobId: string): NotificationPayload {
  return {
    title: SESSION_INVALID_NOTIFICATION.TITLE,
    body: SESSION_INVALID_NOTIFICATION.BODY,
    icon: DEFAULT_NOTIFICATION_ICON,
    data: {
      jobId,
      type: SESSION_INVALID_NOTIFICATION.TYPE,
      url: SESSION_INVALID_NOTIFICATION.URL,
    },
  };
}
