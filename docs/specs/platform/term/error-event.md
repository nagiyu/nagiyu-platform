---
id: platform/term/error-event
title: ErrorEvent (エラーイベント)
kind: term
service: platform
status: active
sources:
  - libs/common/src/error-event/types.ts
  - libs/aws/src/error-events/mapper.ts
sources_hash: c88520758918fa5371d843412123f380e4d2db033b7c3284cb519a5c2e6d9af5
related_cards: [admin/flow/error-notification]
---

# ErrorEvent (エラーイベント)

プラットフォーム上で起きた失敗を表す 1 件の記録。各サービスと CloudWatch Alarm から集め、Admin で一覧する。

## 説明

| 項目 | 内容 |
|---|---|
| eventId | 一意の ID |
| serviceId | 発生元のサービス ID |
| source | `application` (アプリが自分で報告)、`cloudwatch-alarm`、`batch-event` (AWS Batch のジョブ失敗)、`manual` |
| severity | `info`、`warning`、`error`、`critical` |
| title / message | 一覧の見出しと、詳細の本文 |
| context | 元のペイロードなどを入れた JSON 文字列 |
| occurredAt | 発生時刻 (epoch ミリ秒) |

- 保存先は共有の error-events テーブル。書いたあとは変更しない。180 日で自動削除する
- キーは serviceId ごとのパーティションと発生時刻の並びで、全サービス横断の時系列用の索引を別に持つ

## 関連するカード

- [エラー通知の経路](../../admin/flow/error-notification.md)
