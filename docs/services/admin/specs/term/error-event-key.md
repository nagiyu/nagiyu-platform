---
sources:
  - services/admin/web/src/lib/errors/occurred-at.ts
  - services/admin/web/src/app/(protected)/errors/page.tsx
  - services/admin/web/src/app/(protected)/errors/[eventId]/page.tsx
  - services/admin/web/src/app/api/errors/[eventId]/route.ts
  - services/admin/batch/src/stream-handler.ts
  - services/admin/web/public/sw-push.js
  - libs/aws/src/error-events/mapper.ts
sources_hash: e96b2deedcb842adba910e843890ffe3419979ab27bf81038389509540c54a7b
---

# エラー詳細のキー

[ErrorEvent](../../../../platform/specs/term/error-event.md) を 1 件引くための、`eventId`・発生時刻・`serviceId` の 3 つ組。

## 説明

- テーブルのキーが、serviceId ごとのパーティションと、発生時刻と `eventId` を並べた並びキーからできているため、`eventId` だけでは引けない ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md))
- 詳細の画面と API は、パスの `eventId` に、問い合わせの `at` (発生時刻) と `serviceId` を添えて受け取る
    - `at` は epoch ミリ秒の数字。数字でなければ日時の文字列 (`Date.parse` が読めるもの。ISO 8601 を想定) として読む。どちらでも読めなければ「ない」扱いになる
    - `at` か `serviceId` がない、`at` が読めない場合は、画面は「ページが見つかりません」、API は 400 になる
    - 数字だけの `at` は、日時の範囲を超える値 (20 桁など) でも、読めたことになる。そのあと、キーを作る所で例外になり、画面は共通のエラー画面、API は 500 になる (404 や 400 にはならない)
- [一覧](../screen/errors.md)の「詳細」リンクと、Web Push の通知をタップして開く URL ([stream-handler](../batch/stream-handler.md)) は、この 3 つ組を埋め込んでいる。どちらも `eventId` はパスに置き、`at` は epoch ミリ秒で載せる
- 通知の URL は、環境変数 `APP_URL` (Admin 自身の URL) から作る絶対 URL。Service Worker は、通知をタップしたときに、通知の URL と同じパスのタブを探して前面に出す (`/dashboard` のような相対のパスの通知が対象)。絶対 URL はこの照合に一致しないので、エラー通知は、タップするたびに新しいタブで開く (`services/admin/web/public/sw-push.js`)
- 3 つ組で 1 件を引くのは、[エラー詳細画面](../screen/error-detail.md)と[エラー履歴 API](../api/errors.md)

## 理由

- 通知のタップで、ダッシュボードを介さず詳細を開く。通知が届いた直後の関心は、いま届いた異常の中身であり、ダッシュボードに着地して探し直す必要はないため
- 詳細をキーで直接引く。そのため `eventId` だけでなく、発生時刻と serviceId も URL に載せる。`eventId` だけで引く GSI を足さない代わりに、URL が長くなる
- `at` が数字でなければ日時として読むのは、`at` が ISO 8601 のリンクも開けるようにするため
