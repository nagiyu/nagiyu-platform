---
sources:
  - libs/nextjs/src/push.ts
sources_hash: c792ff5abcdac334701f2da7c6679650f16c5f6196d2b2fb1b0ce561306cbe67
---

# Web Push のルート

Web Push の購読に必要な API ルート (VAPID 公開鍵の返却と、購読の受け付け) を作る。`@nagiyu/nextjs` から import する。通しの流れは [Web Push](../common/web-push.md) にある。

## 使い方

| 関数 | 内容 |
|---|---|
| `createVapidPublicKeyRoute(options?)` | VAPID 公開鍵を返す GET ハンドラを作る |
| `createPushSubscribeRoute(options)` | 購読を受け付ける POST ハンドラを作る |
| `validatePushSubscription(subscription)` | 購読の形式を検証する。通れば `PushSubscription` の型ガードとして真 |
| `createSubscriptionId(endpoint)` | endpoint から購読の ID を作る (共通ライブラリのものの再エクスポート) |

`createVapidPublicKeyRoute` のオプション:

| オプション | 内容 | 既定値 |
|---|---|---|
| `onError` | 500 を返す直前に呼ぶ報告用の関数 | なし |

`createPushSubscribeRoute` のオプション:

| オプション | 内容 | 既定値 |
|---|---|---|
| `getSession` | セッションを返す関数 | 必須 |
| `requiredPermission` | 購読に求める権限 | なし (認証だけ確認) |
| `onSubscribe` | 検証済みの購読を保存する関数。`session` / `subscription` / `subscriptionId` を受け取る | なし |
| `onError` | 500 を返す直前に呼ぶ報告用の関数 | なし |

```typescript
export const GET = createVapidPublicKeyRoute({ onError: reportError });
export const POST = createPushSubscribeRoute({
    getSession,
    onSubscribe: async ({ session, subscription, subscriptionId }) => {
        await repository.save(session.user.id, subscriptionId, subscription);
    },
});
```

## 振る舞い

### VAPID 公開鍵

| 条件 | 応答 |
|---|---|
| 環境変数 `VAPID_PUBLIC_KEY` がある | 200 `{ publicKey }` |
| ない、または処理が例外になった | 500 `{ error: 'INTERNAL_ERROR', message: 'VAPID公開鍵が設定されていません' }`。`onError` を呼ぶ |

### 購読の受け付け

次の順で確認し、最初に当たったものを返す。

| 順 | 条件 | ステータス | `error` | `message` |
|---|---|---|---|---|
| 1 | 未認証 | 401 | `UNAUTHORIZED` | ログインが必要です |
| 2 | `requiredPermission` を満たさない | 403 | `FORBIDDEN` | この操作を実行する権限がありません |
| 3 | 本文が JSON として読めない | 400 | `INVALID_REQUEST` | リクエストボディが不正です |
| 4 | 本文にオブジェクトの `subscription` がない | 400 | `INVALID_REQUEST` | サブスクリプション情報が必要です |
| 5 | `subscription` が検証を通らない | 400 | `INVALID_REQUEST` | サブスクリプション情報が不正です |
| 6 | 環境変数 `VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` の片方でもない | 500 | `INTERNAL_ERROR` | VAPID キーが設定されていません |
| 7 | `onSubscribe` を含む処理が例外になった | 500 | `INTERNAL_ERROR` | サブスクリプションの登録に失敗しました |
| 8 | 問題なし | 201 | | `{ success: true, subscriptionId }` |

- 認証と権限の確認は、[認証付きルートハンドラ](./with-auth.md)の `getAuthError` と同じ
- `subscriptionId` は endpoint から作り、`onSubscribe` に渡す。ルート自身は購読を保存しない
- 500 を返す前に `onError` を呼ぶ。`onError` が失敗しても応答は変わらず、`[push] onError コールバックが失敗しました` をログに出す

### 購読の検証

`validatePushSubscription` は、次のすべてを満たすとき真を返す。

- オブジェクトで、`endpoint` が空でない文字列
- `endpoint` が許可された Push サービスのもの ([Web Push](../common/web-push.md) の endpoint の確認)
- `keys` がオブジェクトで、`keys.p256dh` と `keys.auth` が空でない文字列

許可の一覧にないホストを理由に拒否したときは、ホスト名だけを警告ログ (`[push] 許可されていないホストの endpoint を拒否しました:`) に出す。

## 理由

- 警告ログに endpoint 全体ではなくホスト名だけを出す。新しい Push サービスの出現に気づけて、購読を特定できる値は残さないため
- `onError` を呼び出し側から渡させる。`@nagiyu/nextjs` は報告の基盤に依存しないため
