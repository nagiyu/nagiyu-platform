'use client';

import { useEffect } from 'react';
import {
  refreshPushSubscription,
  registerServiceWorker,
  type PushEndpointOptions,
} from '@nagiyu/browser';

export const SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES = {
  SERVICE_WORKER_REGISTRATION_FAILED: 'Service Workerの登録に失敗しました',
  PUSH_SUBSCRIPTION_REFRESH_FAILED: 'Push通知の購読の更新に失敗しました',
} as const;

export interface ServiceWorkerRegistrationProps extends PushEndpointOptions {
  /**
   * 通知を許可済みのユーザーについて、購読を作り直してサーバへ送り直すか（既定: false）。
   * 許可ダイアログは出さない。
   */
  resubscribe?: boolean;
}

/**
 * layout に置いて Service Worker を登録し、必要なら許可済みユーザーの Push 購読を再送する。
 * 何も描画しない。失敗は画面に影響させず console.error に出すだけにする。
 */
export function ServiceWorkerRegistration({
  swPath,
  resubscribe = false,
  vapidPublicKeyEndpoint,
  subscribeEndpoint,
  bodyShape,
}: ServiceWorkerRegistrationProps) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const init = async () => {
      try {
        await registerServiceWorker(swPath);
      } catch (error) {
        console.error(
          SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED,
          error
        );
        return;
      }

      if (!resubscribe) {
        return;
      }

      try {
        await refreshPushSubscription({
          swPath,
          vapidPublicKeyEndpoint,
          subscribeEndpoint,
          bodyShape,
        });
      } catch (error) {
        console.error(
          SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES.PUSH_SUBSCRIPTION_REFRESH_FAILED,
          error
        );
      }
    };

    void init();
  }, [swPath, resubscribe, vapidPublicKeyEndpoint, subscribeEndpoint, bodyShape]);

  return null;
}
