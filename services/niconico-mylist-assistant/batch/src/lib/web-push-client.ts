export { getVapidConfig } from '@nagiyu/common/push';
import type { NotificationPayload } from '@nagiyu/common';

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
    icon: '/icon-192x192.png',
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
 * 二段階認証待機通知のペイロードを生成する
 *
 * @param jobId - ジョブID
 * @returns 通知ペイロード
 */
export function createTwoFactorAuthRequiredPayload(jobId: string): NotificationPayload {
  return {
    title: '二段階認証が必要です',
    body: 'マイリスト登録を続行するには、二段階認証コードを入力してください',
    icon: '/icon-192x192.png',
    data: {
      jobId,
      type: '2fa-required',
      url: `/mylist/status/${jobId}`,
    },
  };
}
