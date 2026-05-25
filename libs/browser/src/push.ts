/**
 * Base64 URL エンコードされた文字列を Uint8Array に変換する。
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export const PUSH_ERROR_MESSAGES = {
  UNSUPPORTED: 'このブラウザはプッシュ通知に対応していません',
  PERMISSION_DENIED: '通知が拒否されました。ブラウザ設定から通知を許可してください',
} as const;

export interface SubscribePushOptions {
  /**
   * VAPID 公開鍵（base64url 形式）。
   * 文字列で事前取得済みのキーを渡すか、関数で遅延取得する。
   * 取得 API は呼び出し側責務。関数形式の場合は許可チェック後に実行される。
   */
  vapidPublicKey: string | (() => Promise<string>);
  /** Service Worker のスクリプトパス（既定: /sw.js） */
  swPath?: string;
  /** 購読完了後に呼ばれるコールバック。サーバへの POST 送信などに利用。 */
  onSubscribed?: (subscription: PushSubscription) => Promise<void> | void;
}

/**
 * プッシュ通知の購読フローを実行する。
 *
 * 内部処理:
 * 1. ブラウザ対応チェック（Notification / ServiceWorker / PushManager）
 * 2. 通知許可をリクエスト
 * 3. Service Worker の登録（既存があれば再利用）
 * 4. 既存 subscription の確認、なければ `pushManager.subscribe()` で新規作成
 * 5. `onSubscribed` コールバックがあれば呼び出し
 */
export async function subscribePush({
  vapidPublicKey,
  swPath = '/sw.js',
  onSubscribed,
}: SubscribePushOptions): Promise<PushSubscription> {
  if (
    typeof window === 'undefined' ||
    typeof window.Notification === 'undefined' ||
    typeof window.Notification.requestPermission !== 'function' ||
    !('serviceWorker' in navigator) ||
    typeof navigator.serviceWorker?.register !== 'function' ||
    !('PushManager' in window)
  ) {
    throw new Error(PUSH_ERROR_MESSAGES.UNSUPPORTED);
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(PUSH_ERROR_MESSAGES.PERMISSION_DENIED);
  }

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register(swPath);
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const resolvedKey =
      typeof vapidPublicKey === 'function' ? await vapidPublicKey() : vapidPublicKey;
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(resolvedKey) as BufferSource,
    });
  }

  await onSubscribed?.(subscription);
  return subscription;
}
