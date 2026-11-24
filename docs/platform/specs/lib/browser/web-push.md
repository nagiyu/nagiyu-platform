---
sources:
  - libs/browser/src/push.ts
sources_hash: 01114034acff952c8afef294e285b386ff55773ba20f6b55392fe0c8d89b6772
---

# Web Push (ブラウザ側)

ブラウザで Push の購読・解除・再購読と、Service Worker の登録を行う。`@nagiyu/browser` から import する。通しの流れは [Web Push](../common/web-push.md) にあり、ここはブラウザ側の関数の振る舞いだけを書く。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `isPushSupported` | なし | 購読の流れを実行できるか |
| `subscribePush` | `PushEndpointOptions` | 購読 (`PushSubscription`) |
| `refreshPushSubscription` | `PushEndpointOptions` | なし |
| `getPushSubscription` | なし | 既存の購読。無ければ `null` |
| `unsubscribePush` | なし | なし |
| `registerServiceWorker` | Service Worker のパス | `ServiceWorkerRegistration` |

`PushEndpointOptions` は、サービスごとに違う API とパスを差し替える設定。

| 項目 | 既定値 | 内容 |
|---|---|---|
| `vapidPublicKeyEndpoint` | `/api/push/vapid-public-key` | VAPID 公開鍵を返す API |
| `subscribeEndpoint` | `/api/push/subscribe` | 購読情報の送信先 |
| `bodyShape` | `wrapped` | 送信 body の形。`wrapped` は `{ subscription: ... }`、`raw` は購読の JSON をそのまま送る |
| `swPath` | `/sw.js` | Service Worker のスクリプトのパス |

## 振る舞い

### 対応判定

`isPushSupported` は、`window.Notification.requestPermission`、`navigator.serviceWorker.register`、`PushManager` がすべてあるときだけ `true`。購読の流れで呼ぶ API の存在まで見るので、古いブラウザで実行時エラーにならない。

### 購読 (`subscribePush`)

1. 非対応なら失敗する
2. 通知の許可を求め、`granted` でなければ失敗する
3. 登録済みの Service Worker を取る。無ければ `swPath` を登録する
4. Service Worker が有効になる (`navigator.serviceWorker.ready`) のを待つ
5. 既存の購読があればそれを使う。無ければ VAPID 公開鍵を取得して購読を作る (`userVisibleOnly: true`)
6. 購読情報を `subscribeEndpoint` に POST する。レスポンスが ok でなければ失敗する。成功したら購読を返す

### 再購読 (`refreshPushSubscription`)

通知を許可済みのユーザーに、購読の存在を保証してサーバーへ送り直す。許可ダイアログは出さない。

- 未ログインのユーザーにも、layout から毎回呼ばれて実行されるので、送信先が 401 を返したときは失敗とせず静かに終える
- 非対応、または許可が `granted` でないときは何もしない
- 手順は購読の 3 から 6 と同じ。ただし送信先が 401 を返したときは、未ログインとみなして例外にせず終える。401 以外の失敗は例外にする
- ログは出さない。呼び出し側が扱う

### 取得と解除

- `getPushSubscription` は、Service Worker か `PushManager` が使えない、または Service Worker が未登録なら `null`。登録の有無は `getRegistration()` で見る。`PushManager` を先に確かめるのは、Service Worker があっても `PushManager` が無いブラウザ (iOS Safari の通常タブなど) があるため
- `unsubscribePush` は購読を解除する。サーバーへは通知しない。非対応・未購読なら何もしない

### Service Worker の登録 (`registerServiceWorker`)

`swPath` を登録し、更新確認 (`update()`) を始めて `registration` を返す。更新確認は待たず、失敗しても無視する。オフラインなどで失敗しうるが登録の成否とは関係なく、待つと後続の購読が遅れるため。`navigator.serviceWorker` が無いと失敗する。

### 失敗したとき

次の場面の失敗は、`PUSH_ERROR_MESSAGES` の固定メッセージの `Error` で投げる。

| 場面 | メッセージ |
|---|---|
| ブラウザが非対応 | このブラウザはプッシュ通知に対応していません |
| 通知が許可されない | 通知が拒否されました。ブラウザ設定から通知を許可してください |
| 公開鍵の取得が失敗 | VAPID公開鍵の取得に失敗しました |
| 公開鍵が空 | VAPID公開鍵が空です |
| 購読情報の送信が失敗 | サブスクリプションの登録に失敗しました |
| Service Worker 非対応 | このブラウザは Service Worker に対応していません |

表にない失敗は、包まずにそのまま投げる。Service Worker の登録や `pushManager.subscribe()` の reject、`fetch` のネットワーク失敗 (`TypeError`)、公開鍵の応答の `response.json()` の例外がこれに当たる。

## 理由

- 公開鍵の取得と購読情報の送信は、購読の関数の中で行い、パッケージの入口からは公開しない。呼び出し側がこれらをつなぐ口を残すと、サービスごとに同じ処理が重複する。サービスごとに違う API のパス・送信する body の形・Service Worker のパスは、`PushEndpointOptions` で指定する
- 登録直後の Service Worker はまだ有効でなく、そのまま購読すると失敗する。このため購読・再購読は `ready` を待つ。`getPushSubscription` が `ready` を使わないのは、Service Worker が未登録だと `ready` が解決せず、永久に待つため
- 購読情報の送信 (`sendPushSubscription`、公開していない内部の関数) は、レスポンスの ok 判定を呼び出し側に任せる。未ログイン (401) を失敗にするかが、購読 (失敗にする) と再購読 (静かに終える) で違うため
