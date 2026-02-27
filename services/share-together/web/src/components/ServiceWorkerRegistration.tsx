'use client';

import { useEffect } from 'react';

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
        console.error('Service Worker registration failed:', error);
      }
    };

    void initServiceWorker();
  }, []);

  return null;
}
