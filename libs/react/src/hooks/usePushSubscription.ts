'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPushSubscription,
  isPushSupported,
  subscribePush,
  unsubscribePush,
} from '@nagiyu/browser';
import type { PushEndpointOptions } from '@nagiyu/browser';

export type UsePushSubscriptionOptions = PushEndpointOptions;

export interface UsePushSubscriptionReturn {
  /**
   * ブラウザがプッシュ通知に対応しているか。
   * SSR とのハイドレーション不一致を避けるため、初回レンダリングは false で、マウント後に確定する。
   */
  supported: boolean;
  /**
   * Notification.permission の現在値（'default' / 'granted' / 'denied'）。
   * `supported` と同じ理由で、初回レンダリングは 'default' で、マウント後に確定する。
   */
  permission: NotificationPermission;
  /** 現在 push subscription が存在するか */
  subscribed: boolean;
  /**
   * `supported` / `permission` / `subscribed` の初期判定が終わったか。
   * false の間は初期値が入っているだけなので、判定結果に依存した表示は ready になってから切り替える。
   */
  ready: boolean;
  /** subscribe / unsubscribe の実行中フラグ */
  loading: boolean;
  /** 直近の操作で発生したエラー（成功時は null） */
  error: Error | null;
  /** プッシュ通知を購読し、購読した PushSubscription を返す */
  subscribe: () => Promise<PushSubscription>;
  /** プッシュ通知の購読を解除する */
  unsubscribe: () => Promise<void>;
}

function readPermission(): NotificationPermission {
  return typeof window !== 'undefined' && typeof window.Notification !== 'undefined'
    ? window.Notification.permission
    : 'default';
}

/**
 * プッシュ通知の購読状態を管理する React Hook。
 *
 * - マウント後にブラウザ対応・許可状態・既存 subscription を確認
 * - `subscribe()` で `@nagiyu/browser` の `subscribePush` を呼び出し、公開鍵の取得とサーバー送信まで行う
 * - `unsubscribe()` で既存 subscription を解除
 */
export function usePushSubscription({
  vapidPublicKeyEndpoint,
  subscribeEndpoint,
  bodyShape,
  swPath,
}: UsePushSubscriptionOptions = {}): UsePushSubscriptionReturn {
  const [supported, setSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isSupported = isPushSupported();
    setSupported(isSupported);
    setPermission(readPermission());

    if (!isSupported) {
      setReady(true);
      return;
    }

    (async () => {
      try {
        const existing = await getPushSubscription();
        if (!cancelled) {
          setSubscribed(Boolean(existing));
        }
      } catch {
        // 初期化エラーは無視（subscribe 時に再評価される）
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const subscription = await subscribePush({
        vapidPublicKeyEndpoint,
        subscribeEndpoint,
        bodyShape,
        swPath,
      });
      setSubscribed(true);
      setPermission(readPermission());
      return subscription;
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      setPermission(readPermission());
      throw asError;
    } finally {
      setLoading(false);
    }
  }, [vapidPublicKeyEndpoint, subscribeEndpoint, bodyShape, swPath]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supported) {
        setSubscribed(false);
        return;
      }
      await unsubscribePush();
      setSubscribed(false);
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      throw asError;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    ready,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
