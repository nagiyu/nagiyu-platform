---
title: 'Web Push 通知のサーバー実装：VAPID と web-push ライブラリ'
description: 'Web Push 通知を自前のサーバーから配信するサーバー側実装を解説。VAPID キーの生成・サブスクリプション保存・web-push ライブラリでの送信・エラーハンドリング・スケール時の注意点まで実例で示します。'
slug: 'web-push-server-implementation'
publishedAt: '2026-03-27'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['Web Push', 'VAPID', 'Node.js', '通知']
relatedServices: ['stock-tracker', 'tools']
---

## はじめに

Web Push の「クライアント側（Service Worker / Push API）」を扱う記事は多いですが、「**サーバー側で何をするか**」は意外と情報が散らばっています。本記事では、nagiyu-platform の Stock Tracker で実装している Push 配信サーバーの構成を整理します。

## サーバー側の責務

サーバーがやることは大きく 3 つ:

1. **VAPID キーの管理**: 公開鍵をクライアントに渡し、秘密鍵で署名
2. **サブスクリプション保存**: クライアントから受け取った endpoint と暗号化鍵を DB に保存
3. **通知送信**: VAPID JWT を作って各 endpoint に POST

各ブラウザの Push サービス（Chrome の FCM、Firefox の Mozilla AutoPush など）は仕様で標準化されているので、サーバー側コードは 1 種類で全ブラウザ対応できます。

## VAPID キーの生成

```bash
npx web-push generate-vapid-keys
```

出力される `publicKey` / `privateKey` の組を環境変数に保存します。秘密鍵は **1 サービスにつき 1 組**を継続使用するのが定石。途中で切り替えると、既存サブスクリプションがすべて無効化されます。

```typescript
// src/lib/push.ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:contact@nagiyu.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);
```

`mailto:` は Push サービスの運営者から問い合わせを受けるときの連絡先で、必須項目です。

## サブスクリプションの保存

クライアントから渡される subscription はこの形式:

```typescript
type PushSubscriptionJSON = {
  endpoint: string; // ブラウザ固有の URL
  expirationTime: number | null;
  keys: {
    p256dh: string; // 公開鍵
    auth: string; // 認証シークレット
  };
};
```

これを「ユーザー ID と紐付けて」DB に保存します。

```typescript
import { z } from 'zod';

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function saveSubscription(userId: string, raw: unknown) {
  const sub = SubscriptionSchema.parse(raw);
  await dynamodb.send(
    new PutCommand({
      TableName,
      Item: {
        PK: `USER#${userId}`,
        SK: `PUSH#${hashEndpoint(sub.endpoint)}`,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        createdAt: new Date().toISOString(),
      },
    })
  );
}
```

複数デバイスから登録できるよう、SK に `endpoint` のハッシュを含めて区別します。

## 通知の送信

```typescript
import webpush from 'web-push';

export async function sendNotification(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  const subs = await getSubscriptions(userId);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24 時間以内に届かなければ破棄
        );
      } catch (err) {
        if (isGone(err)) {
          await deleteSubscription(userId, sub.endpoint);
        } else {
          throw err;
        }
      }
    })
  );
}

function isGone(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err.statusCode === 404 || err.statusCode === 410)
  );
}
```

`Promise.allSettled` で 1 件失敗しても他に影響しないようにします。404 / 410 は **そのサブスクリプションが無効化された**サインなので、即座に DB から消します。残しておくと毎回 404 を踏み続けてレートリミットの無駄遣いになります。

## TTL の設計

Push サービス側で「TTL 秒以内に届かなければ破棄」が設定できます。

- ニュース通知 / リアルタイムアラート: TTL = 60〜300 秒（古い通知は不要）
- マーケティング通知: TTL = 24〜72 時間（ユーザーがオフラインから戻ったら見せたい）

Stock Tracker のような価格アラートなら短く、ブログの更新通知なら長く、と用途で決めます。

## ペイロードのサイズ制限

仕様上 4 KB 以下、実装上は **3 KB 程度に抑える**のが安全。タイトル・本文・遷移先 URL くらいに絞り、画像は URL 参照にします。

```json
{
  "title": "AAPL が 200 ドルに到達",
  "body": "目標価格に到達しました。",
  "url": "/alerts/12345",
  "icon": "/icons/alert-192.png"
}
```

`icon` などの画像は Service Worker 側でフェッチするので、ペイロードには URL だけ入れれば十分です。

## スケール時の注意点

ユーザー数が増えると、`sendNotification` を全員に並列実行する処理がボトルネックになります。

- **Lambda で 1 件ずつ並列処理**: SQS にイベントを流し、Lambda の同時実行で並列化
- **EventBridge → Step Functions**: 大量配信を分散処理。失敗時のリトライも自動化
- **ECS バッチ**: 数十万〜の宛先がある場合は Fargate タスクで一括処理

「1 配信 = 数百 ms × ユーザー数」を 1 マシンでこなすのは無理なので、Push 配信専用の非同期パイプラインを早めに用意します。

## ハマりどころ

- **`endpoint` の URL 末尾の `/`**: ブラウザによって有無が違う。比較するときに正規化する。
- **VAPID 公開鍵をクライアントに渡し忘れる**: `applicationServerKey` がないと subscribe できない。`/api/push/public-key` のような endpoint で配信。
- **HTTPS 必須**: localhost を除き、HTTPS でないと Push API は使えない。dev 環境でも自己署名証明書を用意する。
- **iOS の制約**: iOS 16.4 以降の Safari でようやく PWA 経由で対応。それ以前の iPhone では受信不可。
- **Push 通知の許可ダイアログを連打しない**: 一度拒否されると、ブラウザ設定からしか戻せない。文脈を作ってから求める。

## まとめ

Web Push のサーバー側は VAPID + web-push ライブラリ + サブスクリプションストアの 3 点セットでシンプルに組めます。404/410 の片付け、TTL とペイロードの設計、スケール時の非同期化を最初から織り込んでおけば、運用しながら通知数が増えても破綻しません。
