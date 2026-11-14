---
id: admin/term/error-event-key
title: エラー詳細のキー
kind: term
service: admin
sources:
  - libs/aws/src/error-events/mapper.ts
  - libs/aws/src/error-events/writer.ts
  - services/admin/web/src/lib/errors/occurred-at.ts
sources_hash: aecf0003f3278dc98731c06c8d8852e6419b60623cb805f6acf509aefedd4088
terms: [platform/term/error-event]
related_cards: [admin/screen/errors, admin/screen/error-detail, admin/api/errors, admin/batch/stream-handler, admin/flow/error-notification]
---

# エラー詳細のキー

[ErrorEvent](../../platform/term/error-event.md) を 1 件引くための、`eventId`・発生時刻・`serviceId` の 3 つ組。

## 説明

- テーブルのキーが、serviceId ごとのパーティション (`ERROR_EVENT#{serviceId}`) と、発生時刻と `eventId` を並べた並びキー (`OCCURRED#{ISO 8601}#{eventId}`) からできているため、`eventId` だけでは引けない
- 詳細の画面と API は、パスの `eventId` に、問い合わせの `at` (発生時刻) と `serviceId` を添えて受け取る
    - `at` は epoch ミリ秒の数字。数字でなければ ISO 8601 の日時として読む (数字になる前に発行された通知やブックマークのリンクを生かすため)。どちらでも読めなければ「ない」扱いになる
    - `at` か `serviceId` がない、`at` が読めない場合は、画面は「ページが見つかりません」、API は 400 になる
- 一覧の「詳細」リンクと、Web Push の通知をタップして開く URL は、この 3 つ組を埋め込んでいる
- 発生時刻は、表の並びキーに ISO 8601 (ミリ秒まで固定の桁) で埋め込む。時刻が日時として読めない項目は、書き込めない

## 関連するカード

- [エラー履歴一覧画面](../screen/errors.md): 詳細へのリンクを作る
- [エラー詳細画面](../screen/error-detail.md)・[エラー履歴 API](../api/errors.md): 3 つ組で 1 件を引く
- [stream-handler](../batch/stream-handler.md): 通知の URL に 3 つ組を入れる
