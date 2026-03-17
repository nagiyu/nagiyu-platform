'use client';

import { useEffect } from 'react';
import { urlBase64ToUint8Array } from '@nagiyu/browser';

export const SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES = {
  SERVICE_WORKER_REGISTRATION_FAILED: 'Service Workerの登録に失敗しました',
  VAPID_PUBLIC_KEY_FETCH_FAILED: 'VAPID公開鍵の取得に失敗しました',
  PUSH_SUBSCRIPTION_CREATE_FAILED: 'Push通知の購読作成に失敗しました',
  PUSH_SUBSCRIPTION_REGISTER_FAILED: 'Push通知の購読情報送信に失敗しました',
} as const;

export type ServiceWorkerRegistrationProps =
  | {
      subscribeEndpoint?: undefined;
      vapidPublicKeyEndpoint?: undefined;
    }
  | {
      subscribeEndpoint: string;
      vapidPublicKeyEndpoint: string;
    };

export default function ServiceWorkerRegistration({
  subscribeEndpoint,
  vapidPublicKeyEndpoint,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const initServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        registration.update();

        if (!subscribeEndpoint) {
          return;
        }

        if (Notification.permission !== 'granted') {
          return;
        }

        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          try {
            const vapidResponse = await fetch(vapidPublicKeyEndpoint);
            if (!vapidResponse.ok) {
              console.error(
                SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.VAPID_PUBLIC_KEY_FETCH_FAILED
              );
              return;
            }

            const { publicKey } = (await vapidResponse.json()) as { publicKey: string };

            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            });
          } catch (error) {
            console.error(
              SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_CREATE_FAILED,
              error
            );
            return;
          }
        }

        try {
          const response = await fetch(subscribeEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subscription: subscription.toJSON() }),
          });

          if (!response.ok && response.status !== 401) {
            console.error(
              SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_REGISTER_FAILED,
              response.status
            );
          }
        } catch (error) {
          console.error(
            SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_REGISTER_FAILED,
            error
          );
        }
      } catch (error) {
        console.error(
          SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED,
          error
        );
      }
    };

    void initServiceWorker();
  }, [subscribeEndpoint, vapidPublicKeyEndpoint]);

  return null;
}
