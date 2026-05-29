'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribePush } from '@nagiyu/browser';

export interface UsePushSubscriptionOptions {
  /** VAPID 公開鍵を取得する関数。subscribe() 呼び出し時に遅延実行される。 */
  getVapidPublicKey: () => Promise<string>;
  /** Service Worker のスクリプトパス（既定: /sw.js） */
  swPath?: string;
  /** 購読作成/取得が成功した後に呼ばれるコールバック（サーバへの POST など） */
  onSubscribed?: (subscription: PushSubscription) => Promise<void> | void;
  /** 購読解除が完了した後に呼ばれるコールバック */
  onUnsubscribed?: () => Promise<void> | void;
}

export interface UsePushSubscriptionReturn {
  /** ブラウザがプッシュ通知に対応しているか */
  supported: boolean;
  /** Notification.permission の現在値（'default' / 'granted' / 'denied'） */
  permission: NotificationPermission;
  /** 現在 push subscription が存在するか */
  subscribed: boolean;
  /** subscribe / unsubscribe の実行中フラグ */
  loading: boolean;
  /** 直近の操作で発生したエラー（成功時は null） */
  error: Error | null;
  /** プッシュ通知を購読する */
  subscribe: () => Promise<void>;
  /** プッシュ通知の購読を解除する */
  unsubscribe: () => Promise<void>;
}

const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.Notification !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof navigator.serviceWorker?.register === 'function' &&
  'PushManager' in window;

/**
 * プッシュ通知の購読状態を管理する React Hook。
 *
 * - 初期化時にブラウザ対応・許可状態・既存 subscription を確認
 * - `subscribe()` で `@nagiyu/browser` の `subscribePush` を呼び出す
 * - `unsubscribe()` で既存 subscription を解除
 */
export function usePushSubscription({
  getVapidPublicKey,
  swPath,
  onSubscribed,
  onUnsubscribed,
}: UsePushSubscriptionOptions): UsePushSubscriptionReturn {
  const [supported] = useState<boolean>(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && typeof window.Notification !== 'undefined'
      ? window.Notification.permission
      : 'default'
  );
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!supported) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration || cancelled) {
          return;
        }
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) {
          return;
        }
        setSubscribed(Boolean(existing));
      } catch {
        // 初期化エラーは無視（subscribe 時に再評価される）
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await subscribePush({
        vapidPublicKey: getVapidPublicKey,
        swPath,
        onSubscribed,
      });
      setSubscribed(true);
      if (typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
        setPermission(window.Notification.permission);
      }
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      if (typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
        setPermission(window.Notification.permission);
      }
      throw asError;
    } finally {
      setLoading(false);
    }
  }, [getVapidPublicKey, swPath, onSubscribed]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supported) {
        setSubscribed(false);
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }
      setSubscribed(false);
      await onUnsubscribed?.();
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      throw asError;
    } finally {
      setLoading(false);
    }
  }, [supported, onUnsubscribed]);

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
