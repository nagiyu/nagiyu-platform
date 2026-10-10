/**
 * Base64 URL エンコードされた文字列を Uint8Array に変換する。
 * パッケージの入口からは公開しない内部関数で、テストのためにモジュールからは export している。
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
  SERVICE_WORKER_UNSUPPORTED: 'このブラウザは Service Worker に対応していません',
} as const;

const DEFAULT_VAPID_PUBLIC_KEY_ENDPOINT = '/api/push/vapid-public-key';
const DEFAULT_SUBSCRIBE_ENDPOINT = '/api/push/subscribe';
const DEFAULT_SW_PATH = '/sw.js';

/**
 * Push 購読まわりの手続きで共通に受け取る設定。
 * サービスごとに API パスや Service Worker のパスが異なるため、すべて差し替え可能にしている。
 */
export interface PushEndpointOptions {
  /** VAPID 公開鍵を返す API の URL（既定: `/api/push/vapid-public-key`） */
  vapidPublicKeyEndpoint?: string;
  /** 購読情報の送信先 URL（既定: `/api/push/subscribe`） */
  subscribeEndpoint?: string;
  /**
   * 送信 body の形。`wrapped` は `{ subscription: ... }` で包み、`raw` は `toJSON()` をそのまま送る。
   * サーバー側 API の期待する形に合わせる（既定: `wrapped`）。
   */
  bodyShape?: 'wrapped' | 'raw';
  /** Service Worker のスクリプトパス（既定: `/sw.js`） */
  swPath?: string;
}

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

/**
 * 購読情報の送信の設定。パッケージの入口からは公開しない。
 */
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
 * 購読情報を POST し、レスポンスをそのまま返す。
 * 未ログイン (401) を失敗として扱うかどうかを呼び出し側が決められるよう、ok 判定は行わない。
 */
async function sendPushSubscription(
  subscription: PushSubscription,
  { endpoint = DEFAULT_SUBSCRIBE_ENDPOINT, bodyShape = 'wrapped' }: PostPushSubscriptionOptions = {}
): Promise<Response> {
  const json = subscription.toJSON();
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyShape === 'raw' ? json : { subscription: json }),
  });
}

/**
 * 購読情報をサーバーへ POST する。パッケージの入口からは公開しない内部関数。
 *
 * @throws レスポンスが ok でない場合
 */
export async function postPushSubscription(
  subscription: PushSubscription,
  options: PostPushSubscriptionOptions = {}
): Promise<void> {
  const response = await sendPushSubscription(subscription, options);
  if (!response.ok) {
    throw new Error(PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED);
  }
}

/**
 * VAPID 公開鍵をサーバから取得する。パッケージの入口からは公開しない内部関数。
 *
 * @param endpoint - VAPID 公開鍵を返す API エンドポイント（省略時は `/api/push/vapid-public-key`）
 * @returns VAPID 公開鍵文字列（base64url 形式）
 * @throws 取得失敗時または空のキーを受け取った時
 */
export async function fetchVapidPublicKey(
  endpoint: string = DEFAULT_VAPID_PUBLIC_KEY_ENDPOINT
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

/**
 * `subscribePush` の設定。公開鍵の取得と購読情報の送信は `PushEndpointOptions` の
 * エンドポイントに対して常に行うため、呼び出し側が鍵取得や送信を差し込む口は持たない。
 */
export type SubscribePushOptions = PushEndpointOptions;

/**
 * プッシュ通知の購読フローを実行する。
 *
 * 内部処理:
 * 1. ブラウザ対応チェック（Notification / ServiceWorker / PushManager）
 * 2. 通知許可をリクエスト
 * 3. Service Worker の登録（既存があれば再利用）
 * 4. 既存 subscription の確認、なければ VAPID 公開鍵を取得して `pushManager.subscribe()` で新規作成
 * 5. 購読情報をサーバーへ送信
 */
export async function subscribePush({
  vapidPublicKeyEndpoint,
  subscribeEndpoint,
  bodyShape,
  swPath = DEFAULT_SW_PATH,
}: SubscribePushOptions = {}): Promise<PushSubscription> {
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
    const vapidPublicKey = await fetchVapidPublicKey(vapidPublicKeyEndpoint);
    subscription = await createPushSubscription(registration, vapidPublicKey);
  }

  await postPushSubscription(subscription, { endpoint: subscribeEndpoint, bodyShape });
  return subscription;
}

function createPushSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}

/**
 * Service Worker を登録し、更新確認を走らせて registration を返す。
 *
 * 更新確認はオフラインなどで失敗しうるが、登録自体の成否とは無関係なので握りつぶす。
 * 待たずに返すのは、ネットワーク待ちで後続の購読処理を遅らせないため。
 *
 * @throws Service Worker 非対応、または登録に失敗した場合
 */
export async function registerServiceWorker(
  swPath: string = DEFAULT_SW_PATH
): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    throw new Error(PUSH_ERROR_MESSAGES.SERVICE_WORKER_UNSUPPORTED);
  }
  const registration = await navigator.serviceWorker.register(swPath);
  try {
    registration.update().catch(() => undefined);
  } catch {
    // update() の同期的な失敗も登録の成否には影響させない
  }
  return registration;
}

/**
 * 既存の Push 購読を取得する。Service Worker・PushManager 非対応または未登録なら `null`。
 *
 * `navigator.serviceWorker.ready` は未登録だと永久に解決しないため使わず、`getRegistration()` で判定する。
 * Service Worker はあっても PushManager が無いブラウザ (iOS Safari の通常タブなど) では
 * `registration.pushManager` が存在しないため、先に弾く。
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.serviceWorker ||
    typeof window === 'undefined' ||
    !('PushManager' in window)
  ) {
    return null;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return null;
  }
  return registration.pushManager.getSubscription();
}

/**
 * 既存の Push 購読を解除する。サーバーへの通知は行わない。非対応・未購読なら何もしない。
 */
export async function unsubscribePush(): Promise<void> {
  const subscription = await getPushSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

/**
 * 通知を許可済みのユーザーについて、購読の存在を保証してサーバーへ送り直す。
 * layout から毎回呼ばれる想定で、許可ダイアログは出さない。
 *
 * 送信先が 401 を返した場合は未ログインとみなし、例外にせず静かに終える。
 * それ以外の失敗は例外として投げる（ログ出力は呼び出し側の責務）。
 */
export async function refreshPushSubscription({
  vapidPublicKeyEndpoint,
  subscribeEndpoint,
  bodyShape,
  swPath = DEFAULT_SW_PATH,
}: PushEndpointOptions = {}): Promise<void> {
  if (!isPushSupported() || window.Notification.permission !== 'granted') {
    return;
  }

  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    registration = await navigator.serviceWorker.register(swPath);
  }
  // 登録直後は Service Worker が active でなく、pushManager.subscribe が失敗するため有効化を待つ
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const vapidPublicKey = await fetchVapidPublicKey(vapidPublicKeyEndpoint);
    subscription = await createPushSubscription(registration, vapidPublicKey);
  }

  const response = await sendPushSubscription(subscription, {
    endpoint: subscribeEndpoint,
    bodyShape,
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(PUSH_ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED);
  }
}
