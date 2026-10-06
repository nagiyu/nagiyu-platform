import { sendWebPushNotification } from './client.js';
import type { NotificationPayload, PushSubscription, VapidConfig } from './types.js';

/**
 * 一斉送信の結果。
 * 削除やログ出力は呼び出し側が結果を見て行う。
 */
export type BulkSendResult<T> = {
  /** 送信に成功した対象 */
  sent: T[];
  /** 購読が無効 (404/410) と判定された対象 */
  invalid: T[];
  /** 例外で送信に失敗した対象とそのエラー */
  failed: { target: T; error: unknown }[];
};

/**
 * 複数の送信先へ Web Push を順番に送信する。
 *
 * 1 件の失敗で残りの送信を止めないよう、例外は捕捉して failed に集約する。
 */
export async function sendWebPushNotifications<T>(
  targets: readonly T[],
  toSubscription: (target: T) => PushSubscription,
  payload: NotificationPayload,
  vapidConfig: VapidConfig
): Promise<BulkSendResult<T>> {
  const result: BulkSendResult<T> = { sent: [], invalid: [], failed: [] };

  for (const target of targets) {
    try {
      const success = await sendWebPushNotification(toSubscription(target), payload, vapidConfig);
      if (success) {
        result.sent.push(target);
      } else {
        result.invalid.push(target);
      }
    } catch (error) {
      result.failed.push({ target, error });
    }
  }

  return result;
}
