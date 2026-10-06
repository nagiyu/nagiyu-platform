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
  VAPID_KEY_FETCH_FAILED: 'VAPID公開鍵の取得に失敗しました',
  VAPID_KEY_EMPTY: 'VAPID公開鍵が空です',
  SUBSCRIPTION_REGISTER_FAILED: 'サブスクリプションの登録に失敗しました',
} as const;

/**
 * ブラウザが Web Push の購読フローを実行できるかを判定する。
 * 購読フローで実際に呼ぶ API の存在まで確認し、古いブラウザでの実行時エラーを防ぐ。
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Notification !== 'undefined' &&
    typeof window.Notification.requestPermission === 'function' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker?.register === 'function' &&
    'PushManager' in window
  );
}

export interface PostPushSubscriptionOptions {
  /** 送信先 URL（既定: `/api/push/subscribe`） */
  endpoint?: string;
  /**
   * body の形。`wrapped` は `{ subscription: ... }` で包み、`raw` は `toJSON()` をそのまま送る。
   * サーバー側 API の期待する形に合わせる（既定: `wrapped`）。
   */
  bodyShape?: 'wrapped' | 'raw';
}

/**
 * 購読情報をサーバーへ POST する。
 *
 * @throws レスポンスが ok でない場合
 */
export async function postPushSubscription(
  subscription: PushSubscription,
  { endpoint = '/api/push/subscribe', bodyShape = 'wrapped' }: PostPushSubscriptionOptions = {}
): Promise<void> {
  const json = subscription.toJSON();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyShape === 'raw' ? json : { subscription: json }),
  });
  if (!response.ok) {
    throw new Error(PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED);
  }
}

/**
 * VAPID 公開鍵をサーバから取得する。
 *
 * @param endpoint - VAPID 公開鍵を返す API エンドポイント（省略時は `/api/push/vapid-public-key`）
 * @returns VAPID 公開鍵文字列（base64url 形式）
 * @throws 取得失敗時または空のキーを受け取った時
 */
export async function fetchVapidPublicKey(
  endpoint: string = '/api/push/vapid-public-key'
): Promise<string> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(PUSH_ERROR_MESSAGES.VAPID_KEY_FETCH_FAILED);
  }
  const { publicKey } = (await response.json()) as { publicKey?: string };
  if (!publicKey) {
    throw new Error(PUSH_ERROR_MESSAGES.VAPID_KEY_EMPTY);
  }
  return publicKey;
}

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
  if (!isPushSupported()) {
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
