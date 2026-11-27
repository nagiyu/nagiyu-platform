---
sources:
  - services/livetalk/web/public/manifest.json
  - services/livetalk/web/public/sw.js
  - services/livetalk/web/src/app/layout.tsx
  - services/livetalk/web/src/middleware.ts
  - services/livetalk/web/src/components/InstallGuide.tsx
  - services/livetalk/web/src/lib/pwa/standalone.ts
  - services/livetalk/web/src/lib/home/useOnboarding.ts
  - services/livetalk/web/src/components/NotificationPermission.tsx
sources_hash: e85e292623c4c5330df447f82ed6aa402c66316aa17ed0f1ce3a6fa968115dac
---

# PWA

リブトークを、ホーム画面に追加して単独のアプリのように開き、Web Push を受け取るための仕組み。マニフェスト、Service Worker、その登録、ホーム画面への追加の案内からなる。オフラインでは動かない。

## 説明

### マニフェスト

`services/livetalk/web/public/manifest.json` で配信し、`services/livetalk/web/src/app/layout.tsx` の `metadata.manifest` が指す。

| 項目 | 値 |
|---|---|
| `name`、`short_name` | リブトーク |
| `start_url` | `/` |
| `display` | `standalone` |
| `background_color` | `#ffffff` |
| `theme_color` | `#1976d2` (`viewport.themeColor` も同じ) |
| `icons` | `/icon-192x192.png` (192 x 192)、`/icon-512x512.png` (512 x 512)。どちらも PNG で、`purpose` は `any maskable` |

- `layout.tsx` は、iOS のホーム画面用に `appleWebApp` (`capable: true`、タイトル「リブトーク」、ステータスバーは `default`) と、`icons.apple` (`/icon-192x192.png`) も出す

### Service Worker

`services/livetalk/web/public/sw.js` が、次のイベントだけを扱う。

| イベント | 動き |
|---|---|
| `install` | すぐに有効にする (`skipWaiting`) |
| `activate` | 開いているページをすぐに制御下に置く (`clients.claim`) |
| `push` | 通知を出す。題名・本文・アイコン・バッジ・タグ・`requireInteraction`・`data` は、受け取った JSON の値を使い、無いものは既定 (題名「お知らせ」、本文「お知らせがあるよ」、アイコンとバッジは `/icon-192x192.png`、タグ `livetalk-notify`) にする。JSON でなければ、本文を受け取った文字列にする |
| `notificationclick` | 通知を閉じ、`data.url` (なければ `/`) を開く。開いているこのサービスのウィンドウがあれば、そこで `data.url` へ移して前面に出し、なければ新しいウィンドウで開く ([通知から会話への経路](../flow/notification-open.md)) |
| `notificationclose` | 何もしない |

- `fetch` のハンドラとキャッシュはない。ページや API の応答を保存しないので、オフラインには対応しない

### 登録

`layout.tsx` が、`@nagiyu/react` の `ServiceWorkerRegistration` を `resubscribe` 付きで置く。ページを開くたびに `/sw.js` を登録し、通知を許可済みなら、購読を作り直してサーバーへ送る ([Push 購読の React 部品](../../../../platform/specs/lib/react/push-subscription.md)、[Web Push (ブラウザ側)](../../../../platform/specs/lib/browser/web-push.md))。購読を受ける API は[Push 購読の API](../api/push.md)にある。

### 認証の対象から外すパス

`services/livetalk/web/src/middleware.ts` の `matcher` は、次を認証 (ミドルウェア) の対象から外す。

- `/api` 配下 (各 API が自分で判定する。[権限とロール](./permission.md))
- `_next/static`、`_next/image`
- `favicon.ico`、`manifest.json`、`icon-192x192.png`、`icon-512x512.png`、`sw.js`

### ホーム画面への追加の案内

[ホーム画面](../screen/home.md)が、同意のあとに、案内を 1 つだけ出す。判定は `services/livetalk/web/src/lib/home/useOnboarding.ts` が行う。

| 案内 | 出す条件 |
|---|---|
| ホーム画面への追加 | ホーム画面から開いた状態 (スタンドアロン) ではなく、案内を見送ってから 3 日たっている (見送りの記録がない場合も含む) |
| 通知の許可 | スタンドアロンで、Push に対応し、通知が許可されておらず、案内を見送ってから 3 日たっている |

- スタンドアロンかどうかは、`display-mode: standalone` のメディアクエリか、`navigator.standalone` で判定する (`services/livetalk/web/src/lib/pwa/standalone.ts`)
- ホーム画面への追加の案内 (`InstallGuide.tsx`) は、端末で出し分ける
    - iOS (iPhone・iPad・iPod): 共有ボタンから「ホーム画面に追加」を選ぶ手順を示す
    - それ以外: 「ホーム画面に追加する」ボタンを出す。ブラウザが `beforeinstallprompt` を発火していればその確認を出し、していなければ見送りとして扱う
- 見送りの時刻は、ブラウザのローカルストレージ (`livetalk-install-snoozed-at`、`livetalk-notification-snoozed-at`) に残す ([ローカルストレージ](../../../../platform/specs/lib/browser/local-storage.md))。「あとでね」を押したとき、またはホーム画面への追加を受け入れたときに記録する

## 理由

- ホーム画面への追加を案内するのは、iOS では、ホーム画面に追加した PWA として開かないと Web Push を受け取れないためである。通知の許可の案内は、スタンドアロンで開いたときにだけ出す
