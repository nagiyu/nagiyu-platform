---
sources:
  - libs/react/src/hooks/usePushSubscription.ts
  - libs/react/src/components/ServiceWorkerRegistration.tsx
sources_hash: ff322b1394a1db4bf9562f1b1eda983355fb35a49536ab0f9122ebaad20692dc
---

# Push 購読の React 部品

Push 購読の状態を扱う `usePushSubscription` と、Service Worker を登録する `ServiceWorkerRegistration`。`@nagiyu/react` から import する。購読の手続きは [ブラウザ側の Web Push](../browser/web-push.md) を呼び、通しの流れは [Web Push](../common/web-push.md) にある。

## 使い方

### usePushSubscription

引数は [`PushEndpointOptions`](../browser/web-push.md) (`vapidPublicKeyEndpoint`、`subscribeEndpoint`、`bodyShape`、`swPath`)。すべて省略できる。

| 戻り値 | 内容 |
|---|---|
| `supported` | ブラウザが Push に対応しているか |
| `permission` | `Notification.permission` の現在値 |
| `subscribed` | 購読が存在するか |
| `ready` | 上の 3 つの初期判定が終わったか |
| `loading` | `subscribe` / `unsubscribe` の実行中か |
| `error` | 直近の操作のエラー。成功すると `null` |
| `subscribe` | 購読して `PushSubscription` を返す |
| `unsubscribe` | 購読を解除する |

### ServiceWorkerRegistration

layout に置くと、Service Worker を登録する。何も描画しない。

| props | 既定値 | 内容 |
|---|---|---|
| `swPath` | `/sw.js` | 登録する Service Worker |
| `resubscribe` | `false` | 通知を許可済みのユーザーの購読を、サーバーへ送り直すか |
| `vapidPublicKeyEndpoint`、`subscribeEndpoint`、`bodyShape` | `PushEndpointOptions` の既定値 | `resubscribe` のときだけ使う |

## 振る舞い

### usePushSubscription

- 初回レンダリングは `supported` が `false`、`permission` が `default`、`ready` が `false`。マウント後に確定する。SSR とのハイドレーション不一致を避けるため。判定に依存した表示は `ready` になってから切り替える
- マウント後に、対応・許可の状態を読み、対応していれば既存の購読を調べて `subscribed` にする。この調べが失敗しても無視して `ready` にする。非対応なら、購読を調べずにすぐ `ready` になる
- `subscribe` は `loading` を立て、`error` を消してから購読する。成功すると `subscribed` を `true` にする。成功しても失敗しても `permission` を読み直す。失敗すると `error` に入れたうえで、同じエラーを投げ直す
- `unsubscribe` は、`supported` が `false` のとき (非対応のブラウザと、マウント後の初期判定の前) は解除せず `subscribed` を `false` にするだけ。対応していれば解除してから `subscribed` を `false` にする。失敗は `error` に入れて投げ直す

### ServiceWorkerRegistration

- `navigator.serviceWorker` が無ければ何もしない
- マウント時と props が変わったときに、Service Worker を登録する (更新確認も始まる)。登録に失敗したら、`console.error` に出して終える (再購読はしない)
- `resubscribe` が `true` なら、登録の後に再購読する。許可ダイアログは出さない。未ログイン (401) の扱いは [Web Push (ブラウザ側)](../browser/web-push.md) にある。失敗は `console.error` に出すだけ
- 失敗は画面に影響させない

| 失敗 | ログのメッセージ |
|---|---|
| 登録 | Service Workerの登録に失敗しました |
| 再購読 | Push通知の購読の更新に失敗しました |
