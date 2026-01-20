'use client';

import { useEffect } from 'react';

/**
 * Base64 URL エンコードされた文字列を Uint8Array に変換
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Service Worker を登録し、Push 通知サブスクリプションを管理するコンポーネント
 *
 * アプリ起動時に以下を行う:
 * 1. Service Worker を登録
 * 2. 通知許可が付与されている場合、サブスクリプションを確認
 * 3. サブスクリプションが存在しなければ新規作成
 * 4. サーバーの全アラートのサブスクリプション情報を更新
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const initServiceWorker = async () => {
      try {
        // Service Worker を登録
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration.scope);

        // Service Worker の更新をチェック
        registration.update();

        // 通知許可の確認
        if (Notification.permission !== 'granted') {
          // 許可されていない場合はサブスクリプション処理をスキップ
          return;
        }

        // Service Worker が ready になるまで待機
        await navigator.serviceWorker.ready;

        // 現在のサブスクリプションを確認
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // サブスクリプションが存在しない場合、新規作成を試みる
          console.log('No push subscription found, creating new one...');

          try {
            // VAPID 公開鍵を取得
            const vapidResponse = await fetch('/api/push/vapid-public-key');
            if (!vapidResponse.ok) {
              console.error('Failed to fetch VAPID public key');
              return;
            }
            const { publicKey } = await vapidResponse.json();

            // Push 通知をサブスクライブ
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            });

            console.log('Push subscription created');
          } catch (error) {
            console.error('Failed to create push subscription:', error);
            return;
          }
        }

        // サーバーにサブスクリプション情報を送信し、全アラートを更新
        try {
          const response = await fetch('/api/push/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.updatedCount > 0) {
              console.log(`Updated ${result.updatedCount} alert(s) with new subscription`);
            }
          } else if (response.status === 401) {
            // 未ログインの場合は無視（正常なケース）
          } else {
            console.error('Failed to refresh push subscription:', response.status);
          }
        } catch (error) {
          console.error('Failed to refresh push subscription:', error);
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    };

    initServiceWorker();
  }, []);

  return null;
}
