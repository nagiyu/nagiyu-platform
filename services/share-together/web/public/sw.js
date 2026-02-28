const CACHE_NAME = 'share-together-v1';
const CACHE_URLS = ['/', '/manifest.json', '/icon-192x192.png', '/icon-512x512.png'];
const ERROR_MESSAGES = {
  CACHE_INSTALL_FAILED: 'キャッシュのインストールに失敗しました',
  CACHE_PUT_FAILED: 'キャッシュへの保存に失敗しました',
  NETWORK_FETCH_FAILED: 'ネットワークからの取得に失敗しました',
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_URLS))
      .catch((error) => {
        console.error(ERROR_MESSAGES.CACHE_INSTALL_FAILED, error);
        throw error;
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    )
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseToCache))
          .catch((error) => console.error(ERROR_MESSAGES.CACHE_PUT_FAILED, error));

        return response;
      })
      .catch((error) => {
        console.error(ERROR_MESSAGES.NETWORK_FETCH_FAILED, error);
        return caches.match(event.request);
      })
  );
});

// Push 通知の実装は将来対応（MVP v1では未実装）
// self.addEventListener('push', (event) => {
//   console.log('Push event received', event);
// });
