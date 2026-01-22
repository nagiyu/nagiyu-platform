// Service Worker for Stock Tracker Push Notifications

// インストール時
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // 即座にアクティベート
  self.skipWaiting();
});

// アクティベート時
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
  // 既存のクライアントを制御
  event.waitUntil(self.clients.claim());
});

// Push通知受信時
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');

  let data = {
    title: 'Stock Tracker',
    body: 'アラート通知',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: 'stock-alert',
    requireInteraction: true,
  };

  // プッシュデータがある場合はパース
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || data.tag,
        requireInteraction: payload.requireInteraction ?? data.requireInteraction,
        data: payload.data || {},
      };
    } catch (e) {
      console.error('Service Worker: Failed to parse push data', e);
      data.body = event.data.text();
    }
  }

  // 通知を表示
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      requireInteraction: data.requireInteraction,
      data: data.data,
    })
  );
});

// 通知クリック時
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');

  event.notification.close();

  // クリック時のURL（デフォルトはアラート一覧）
  const urlToOpen = event.notification.data?.url || '/alerts';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているウィンドウがあればフォーカス
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // なければ新しいウィンドウを開く
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// 通知閉じた時
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification closed');
});
