'use client';

import { useEffect } from 'react';

/**
 * Service Worker を登録するコンポーネント
 * アプリ起動時に Service Worker を登録し、Push 通知を受信できるようにする
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);

          // Service Worker の更新をチェック
          registration.update();
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return null;
}
