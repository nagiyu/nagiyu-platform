self.addEventListener('push', (event) => {
  let payload = {
    title: 'Admin 通知',
    body: 'エラー通知を受信しました',
    icon: '/favicon.ico',
    data: {
      url: '/dashboard',
    },
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = {
        ...payload,
        ...data,
        data: {
          url: '/dashboard',
          ...extractDataPayload(data),
        },
      };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      data: payload.data,
    })
  );
});

function extractDataPayload(data) {
  if (!data || typeof data !== 'object' || !('data' in data)) {
    return {};
  }

  if (data.data === null || typeof data.data !== 'object') {
    return {};
  }

  return data.data;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const targetUrl = new URL(client.url);
        if (targetUrl.pathname === url && 'focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
