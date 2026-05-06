<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/admin/requirements.md に統合して削除します。
-->

# エラー通知の永続化と集約閲覧基盤 - 要件定義

関連 Issue: [#2940](https://github.com/nagiyu/nagiyu-platform/issues/2940)

---

## 1. ビジネス要件

### 1.1 背景・目的

現在、Admin に CloudWatch のエラー通知が SNS 経由の Web Push で届いているが、通知ペイロードを永続化していないため、Push をタップしてしまうと「何のエラーが来ていたか」を後から確認する手段がない。

将来的にはアプリケーション層からも共通のエラーレポータ経由でエラーを集約し、Admin で「どのサービスでどんなエラーが起きているか」を一元的に確認できるプラットフォーム基盤に発展させたい。

本タスクではその第一歩として、**最小スコープで永続化と閲覧 UI を整備し、将来の拡張に耐えるデータ基盤** を確立する。

### 1.2 対象ユーザー

- **プライマリ**: プラットフォーム運用者（Admin にアクセス可能なロール保持者）
- **セカンダリ（将来）**: 各サービスを開発する開発者（共通レポータ SDK の利用者）

### 1.3 ビジネスゴール

- Admin から「過去どんなエラーが、どのサービスで、いつ起きたか」を辿れる状態にする
- 個別サービスの Push 通知ロジックを共通化し、各サービスは「エラー報告」だけに集中できる土台を作る

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: CloudWatch Alarm 由来エラーの永続化

- **概要**: CloudWatch Alarm が発火した際、その内容を DynamoDB に永続化し、Push 通知を発火する
- **アクター**: CloudWatch Alarm（システム）
- **前提条件**: SNS Topic から `alarm-ingest` Lambda にメッセージが届く
- **正常フロー**:
  1. CloudWatch Alarm が `OK → ALARM` 遷移し、SNS Topic にメッセージを発行
  2. `alarm-ingest` Lambda が SNS メッセージを受信
  3. メッセージをパースし `ErrorEvent` レコードを `error-events` テーブルに `PutItem`
  4. DynamoDB Streams 経由で `stream-handler` Lambda が起動
  5. `stream-handler` が登録済み購読者全員に Web Push を送信
- **例外フロー**:
  - 書き込み失敗 → DLQ（次回検証用）+ 自己監視アラーム発火
  - Push 送信失敗 → 既存ロジック通り購読を破棄、ログ出力

#### UC-002: 永続化されたエラーの一覧閲覧

- **概要**: Admin 運用者が `/errors` ページで過去のエラーを時系列で閲覧する
- **アクター**: 認証済み運用者（`errors:read` パーミッション保持）
- **正常フロー**:
  1. 運用者が `/errors` にアクセス
  2. 全サービスのエラーが時系列降順で表示される
  3. サービス・期間でフィルタできる
  4. 各行をクリック → 詳細ページ `/errors/{eventId}` へ遷移

#### UC-003: 個別エラーの詳細閲覧

- **概要**: 特定の eventId についてフルペイロードを参照する
- **アクター**: 認証済み運用者（`errors:read`）
- **正常フロー**:
  1. 運用者が `/errors/{eventId}` にアクセス（または Push タップから）
  2. メタ情報（serviceId, severity, occurredAt, source 等）+ context（生 JSON）を表示

#### UC-004: 通知タップによる詳細遷移

- **概要**: Push 通知をタップすると当該イベントの詳細ページに遷移する
- **アクター**: 認証済み運用者
- **正常フロー**:
  1. 運用者が Push 通知を受信
  2. タップ
  3. ブラウザが `/errors/{eventId}` を開く（既存の `/dashboard` 固定遷移から変更）

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| --- | --- | --- | --- |
| F-001 | エラー永続化 | CloudWatch Alarm 由来のエラーを DynamoDB に保存 | 高 |
| F-002 | エラー一覧 UI | サービス・期間フィルタ付きの時系列一覧 | 高 |
| F-003 | エラー詳細 UI | フル context を含む詳細ページ | 高 |
| F-004 | Push タップ遷移 | `/dashboard` から `/errors/{eventId}` へ変更 | 高 |
| F-005 | 自己監視 | 新システム自身の障害を既存 Push 経路で検知 | 高 |
| F-006 | DLQ + アラーム | Stream Handler 失敗イベントの救済 | 中 |
| F-007 | RBAC | `errors:read` パーミッションを追加 | 中 |
| F-008 | 共通書き込み SDK | `libs/aws/error-events` で `ErrorEventWriter` を提供 | 高 |

### 2.3 想定画面の概要

- エラー一覧画面（`/errors`）
- エラー詳細画面（`/errors/{eventId}`）

詳細は `external-design.md` を参照。

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| --- | --- |
| 応答時間（一覧） | p95 で 1 秒以内（最大 100 件） |
| 応答時間（詳細） | p95 で 500ms 以内 |
| 書き込みスループット | CloudWatch Alarm の同時発火（最大 14 件 / 5 分）を吸収できること |

### 3.2 セキュリティ要件

- `error-events` テーブルへの書き込み権限は、`alarm-ingest` Lambda のみに付与（最小権限）
- 読み取り API には Admin の既存認証 + `errors:read` パーミッションを必須化
- CloudWatch ペイロードに PII は含まれない前提（Phase 1）。アプリ層レポート時は別途 sanitizer 必須

### 3.3 可用性要件

| 項目 | 要件 |
| --- | --- |
| 永続化の RPO | 5 分（DLQ 経由で再処理可能） |
| 自己監視の検知遅延 | 10 分以内に管理者の Push 通知に届く |

### 3.4 保守性・拡張性要件

- 書き込み SDK は `libs/aws/error-events` に集約し、将来の各サービスからの直接利用を想定したインタフェースを提供する
- in-memory 実装を同梱し、テスト時に DynamoDB なしで動作可能にする
- データモデルは将来の `source: 'application'` 追加に耐えるよう、`source` フィールドを最初から備える

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| --- | --- |
| ErrorEvent | 1 件のエラー通知。サービス ID・重大度・発生時刻・タイトル・本文・コンテキストを持つ |
| ErrorSource | エラーの発生源種別（`cloudwatch-alarm` のみ。将来 `application` / `manual` を追加） |
| ErrorSeverity | 重大度（`info` / `warning` / `error` / `critical`） |
| ServiceId | エラー発生元サービスの識別子（例: `stock-tracker`） |

---

## 5. スコープ外

- ❌ アプリケーション層からの直接エラーレポート SDK
- ❌ fingerprint による重複抑止
- ❌ PII / 機密情報の sanitizer
- ❌ 通知レートリミット
- ❌ CloudWatch OK 通知のハンドリング（現状 `addOkAction` 未設定）
- ❌ Stream の at-least-once 二重 Push 対策
- ❌ 既存 Stock Tracker 以外のサービスへのアラーム配備
- ❌ メールや Slack など外部チャットへの通知連携

---

## 6. 用語集

| 用語 | 定義 |
| --- | --- |
| ErrorEvent | 永続化される 1 件のエラー記録 |
| 自己監視 | エラー通知システム自身の障害を検知する仕組み |
| `alarm-ingest` Lambda | SNS → DynamoDB の橋渡しを行う新規 Lambda |
| `stream-handler` Lambda | DynamoDB Streams を契機に Web Push を fan-out する新規 Lambda |
