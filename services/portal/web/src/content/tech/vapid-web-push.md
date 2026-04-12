---
title: 'Web Push通知をVAPIDキーで実装する方法'
description: 'VAPIDキーを使ったWeb Push通知の実装方法を解説。サービスワーカーの設定・Push APIのサブスクリプション管理・web-pushライブラリでのサーバーサイド送信・ブラウザサポートまで詳しく説明します。'
slug: 'vapid-web-push'
publishedAt: '2026-04-10'
tags: ['Web Push', 'VAPID', '通知']
---

## はじめに

Web Push 通知は、ユーザーがサイトを開いていない状態でもブラウザに通知を送れる強力な機能です。株価アラートや処理完了通知など、タイムリーな情報をユーザーに届けるのに適しています。本記事では、VAPID キーを使ったセキュアな Web Push 通知の実装方法を解説します。

## VAPID とは

VAPID（Voluntary Application Server Identification）は、プッシュ通知の送信元を検証するための仕組みです。サーバーが公開鍵・秘密鍵ペアを生成し、プッシュサービスに対して「自分がそのキーペアの所有者である」ことを証明します。これにより、他者が不正にプッシュ通知を送信することを防げます。

## VAPID キーの生成

### ブラウザで生成する場合

nagiyu Tools（[https://tools.nagiyu.com](https://tools.nagiyu.com)）の VAPID キー生成ツールを使うと、ブラウザ上でキーペアを生成できます。

### Node.js で生成する場合

```bash
npm install web-push
```

```javascript
const webPush = require('web-push');
const vapidKeys = webPush.generateVAPIDKeys();

console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
```

生成した秘密鍵は環境変数に保存し、ソースコードにはコミットしないよう注意してください。

## フロントエンドの実装

### ステップ 1: サービスワーカーの登録

```typescript
// src/lib/pushNotification.ts
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('このブラウザはWeb Push通知に対応していません');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker 登録完了:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker 登録失敗:', error);
    return null;
  }
}
```

### ステップ 2: 通知の許可を要求する

```typescript
export async function requestNotificationPermission(): Promise<boolean> {
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}
```

### ステップ 3: プッシュ通知のサブスクリプション

```typescript
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function subscribePushNotification(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // サブスクリプション情報をサーバーに送信して保存
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    return subscription;
  } catch (error) {
    console.error('サブスクリプション失敗:', error);
    return null;
  }
}
```

### ステップ 4: サービスワーカーのプッシュイベント処理

```javascript
// public/sw.js
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: { url: data.url },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;

  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
```

## サーバーサイドの実装

### サブスクリプションの保存

```typescript
// src/app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: '未認証です' }, { status: 401 });
  }

  const subscription = await request.json();

  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { keys: subscription.keys, userId: user.id },
    create: {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: user.id,
    },
  });

  return NextResponse.json({ message: 'サブスクリプション登録完了' });
}
```

### プッシュ通知の送信

```typescript
// src/lib/sendPushNotification.ts
import webPush from 'web-push';

webPush.setVapidDetails(
  'mailto:admin@nagiyu.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload
): Promise<boolean> {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'statusCode' in error &&
      (error as { statusCode: number }).statusCode === 410
    ) {
      // サブスクリプションが無効（ユーザーが通知を解除した場合）
      console.log('無効なサブスクリプション。削除します。');
      // DBからサブスクリプションを削除する処理をここに追加
    }
    return false;
  }
}
```

## ブラウザサポート

| ブラウザ         | デスクトップ     | モバイル           |
| ---------------- | ---------------- | ------------------ |
| Chrome           | ✅ 対応          | ✅ 対応（Android） |
| Firefox          | ✅ 対応          | ✅ 対応（Android） |
| Edge             | ✅ 対応          | ✅ 対応            |
| Safari           | ✅ macOS 13 以降 | ✅ iOS 16.4 以降   |
| Samsung Internet | —                | ✅ 対応            |

## セキュリティに関する注意事項

- VAPID 秘密鍵は絶対に公開しないでください。環境変数やシークレット管理サービス（AWS Secrets Manager など）で管理します。
- サブスクリプション情報にはエンドポイント URL が含まれます。これは個人を特定しうる情報として適切に管理してください。
- `userVisibleOnly: true` を必ず設定してください。これにより、プッシュ通知は常にユーザーに表示される通知を伴うことが保証されます。

## まとめ

Web Push 通知は、サービスワーカー・Push API・VAPID 認証という 3 つの要素で構成されます。フロントエンドでのサブスクリプション取得・サーバーへの保存・サーバーサイドからの通知送信という一連のフローを理解することが実装の鍵です。nagiyu の Stock Tracker でもこの実装パターンを活用して、株価アラートの通知を実現しています。
