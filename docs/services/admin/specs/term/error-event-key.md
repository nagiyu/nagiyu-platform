---
sources:
  - services/admin/web/src/lib/errors/occurred-at.ts
  - services/admin/web/src/app/(protected)/errors/page.tsx
  - services/admin/web/src/app/(protected)/errors/[eventId]/page.tsx
  - services/admin/web/src/app/api/errors/[eventId]/route.ts
  - services/admin/batch/src/stream-handler.ts
sources_hash: a6a715198c058829d7fe95a728b6f8da9d6857692483e51fefedbb4d4b5125d1
---

# エラー詳細のキー

[ErrorEvent](../../../../platform/specs/term/error-event.md) を 1 件引くための、`eventId`・発生時刻・`serviceId` の 3 つ組。

## 説明

- テーブルのキーが、serviceId ごとのパーティションと、発生時刻と `eventId` を並べた並びキーからできているため、`eventId` だけでは引けない ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md))
- 詳細の画面と API は、パスの `eventId` に、問い合わせの `at` (発生時刻) と `serviceId` を添えて受け取る
    - `at` は epoch ミリ秒の数字。数字でなければ ISO 8601 の日時として読む (数字になる前に発行された通知やブックマークのリンクを生かすため)。どちらでも読めなければ「ない」扱いになる
    - `at` か `serviceId` がない、`at` が読めない場合は、画面は「ページが見つかりません」、API は 400 になる
- [一覧](../screen/errors.md)の「詳細」リンクと、Web Push の通知をタップして開く URL ([stream-handler](../batch/stream-handler.md)) は、この 3 つ組を埋め込んでいる。どちらも `eventId` はパスに置き、`at` は epoch ミリ秒で載せる
- 3 つ組で 1 件を引くのは、[エラー詳細画面](../screen/error-detail.md)と[エラー履歴 API](../api/errors.md)

## 理由

- 通知のタップで、ダッシュボードを介さず詳細を開く。通知が届いた直後の関心は、いま届いた異常の中身であり、ダッシュボードに着地して探し直す必要はないため
- 詳細をキーで直接引く。そのため `eventId` だけでなく、発生時刻と serviceId も URL に載せる。`eventId` だけで引く GSI を足さない代わりに、URL が長くなる
- 通知を出す Lambda に `APP_URL` (Admin 自身の URL) を渡し、通知の URL を絶対 URL にする。ドメインをまたいでも、この URL がそのまま働くようにするため
