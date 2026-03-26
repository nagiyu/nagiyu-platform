'use client';

import { useState } from 'react';
import { Button, Alert } from '@mui/material';
import { urlBase64ToUint8Array } from '@nagiyu/browser';

const ERROR_MESSAGES = {
  UNSUPPORTED: 'このブラウザはプッシュ通知に対応していません',
  PERMISSION_DENIED: '通知が拒否されました。ブラウザ設定から通知を許可してください',
  VAPID_KEY_FETCH_FAILED: 'VAPID 公開鍵の取得に失敗しました',
  VAPID_KEY_EMPTY: 'VAPID 公開鍵が空です',
  SUBSCRIPTION_CREATE_FAILED: '通知購読の作成に失敗しました',
  SUBSCRIPTION_REGISTER_FAILED: '通知購読の登録に失敗しました',
  UNKNOWN: '通知設定中にエラーが発生しました',
} as const;

const SUCCESS_MESSAGE = '通知を有効化しました';

export default function NotifyButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleEnableNotification = async () => {
    setMessage(null);
    setIsError(false);
    setIsLoading(true);

    try {
      const hasNotificationApi =
        typeof window.Notification !== 'undefined' &&
        typeof window.Notification.requestPermission === 'function';
      const hasServiceWorkerApi =
        'serviceWorker' in navigator && typeof navigator.serviceWorker?.register === 'function';

      if (!hasNotificationApi || !hasServiceWorkerApi) {
        throw new Error(ERROR_MESSAGES.UNSUPPORTED);
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(ERROR_MESSAGES.PERMISSION_DENIED);
      }

      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw-push.js');
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const vapidResponse = await fetch('/api/notify/vapid-key');
        if (!vapidResponse.ok) {
          throw new Error(ERROR_MESSAGES.VAPID_KEY_FETCH_FAILED);
        }

        const { publicKey } = (await vapidResponse.json()) as { publicKey?: string };
        if (!publicKey) {
          throw new Error(ERROR_MESSAGES.VAPID_KEY_EMPTY);
        }

        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        } catch {
          throw new Error(ERROR_MESSAGES.SUBSCRIPTION_CREATE_FAILED);
        }
      }

      const response = await fetch('/api/notify/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.SUBSCRIPTION_REGISTER_FAILED);
      }

      setMessage(SUCCESS_MESSAGE);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button variant="contained" onClick={handleEnableNotification} disabled={isLoading}>
        通知を有効にする
      </Button>
      {message && (
        <Alert severity={isError ? 'error' : 'success'} sx={{ mt: 2 }}>
          {message}
        </Alert>
      )}
    </>
  );
}
