'use client';

import { useEffect } from 'react';

export const ERROR_MESSAGES = {
  SERVICE_WORKER_REGISTRATION_FAILED: 'Service Workerの登録に失敗しました',
};

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const initServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        registration.update();
      } catch (error) {
        console.error(ERROR_MESSAGES.SERVICE_WORKER_REGISTRATION_FAILED, error);
      }
    };

    void initServiceWorker();
  }, []);

  return null;
}
