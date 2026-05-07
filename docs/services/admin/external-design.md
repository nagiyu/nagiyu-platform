# Admin サービス 外部設計書

外部仕様（画面・遷移・主要 API）の詳細は本書で扱う。
内部実装・データモデル・ADR は `architecture.md`、要件・ユースケースは `requirements.md` を参照。

---

## 1. 画面一覧

| 画面名 | パス | 認可 | 備考 |
| --- | --- | --- | --- |
| ダッシュボード | `/dashboard` | 認証済み | ユーザー情報・認証ステータス・通知設定・エラー履歴導線 |
| エラー履歴一覧 | `/errors` | `errors:read` | 永続化されたエラー通知の時系列降順リスト |
| エラー詳細 | `/errors/{eventId}` | `errors:read` | フル context の整形表示 |
| サインイン | `/signin` | 不要 | Auth サービスへリダイレクト |

---

## 2. 画面遷移図

```
[ Dashboard /dashboard ]
        │
        │  「エラー履歴を表示」ボタン
        ▼
[ エラー一覧 /errors ]──────────┐
        │                        │  Push 通知タップ
        │  「詳細」ボタン         │  （Service Worker から直接遷移）
        ▼                        ▼
[ エラー詳細 /errors/{eventId}?at=...&serviceId=... ]
        │
        │  「← エラー履歴に戻る」
        ▼
[ エラー一覧 /errors ]
```

---

## 3. エラー履歴一覧画面（`/errors`）

### 3.1 表示要素

| 要素 | 内容 |
| --- | --- |
| ページタイトル | 「エラー履歴」 |
| フィルタバー | サービス ID（任意の文字列）・期間プリセット（直近 24 時間 / 7 日 / 30 日 / 指定なし） |
| エラーテーブル | 1 行 1 ErrorEvent。発生時刻・サービス・重大度・タイトル/概要・詳細ボタン |
| ページャ | `nextCursor` がある場合に「次のページ」ボタンを表示 |

### 3.2 テーブルカラム

| カラム | 内容 |
| --- | --- |
| 発生時刻 (JST) | `Asia/Tokyo` 表示 |
| サービス | `serviceId`（Chip） |
| 重大度 | `severity`（Chip、色: critical/error=red, warning=yellow, info=blue） |
| タイトル / 概要 | `title` を太字 + `message` 先頭 80 文字 |
| 詳細 | 詳細ページへの遷移ボタン |

### 3.3 認可・例外表示

- `errors:read` 権限なし: 「権限がありません」を表示（403 相当の UI）
- 検索結果ゼロ: 「エラー履歴がありません」のメッセージ

### 3.4 クエリパラメータ

`/errors?serviceId=xxx&period=24h&cursor=base64`

- `serviceId`: 任意。指定時は当該サービスのみフィルタ
- `period`: `24h` / `7d` / `30d` / `all`（既定 `24h`）
- `cursor`: 前回 GET の `nextCursor` を引き渡し

---

## 4. エラー詳細画面（`/errors/{eventId}`）

### 4.1 必須クエリパラメータ

`/errors/{eventId}?at={ISO8601 occurredAt}&serviceId={serviceId}`

両方が必須。欠けている場合は 404 表示。

### 4.2 表示要素

| セクション | 内容 |
| --- | --- |
| ヘッダー | severity Chip + title |
| メタ情報カード | eventId / serviceId / source / 発生時刻 (JST) / 発生時刻 (UTC) |
| 本文 | `message`（プリフォーマットなし、改行尊重） |
| コンテキスト | `context` JSON を整形表示（grey 背景の `<pre>` 内） |
| 戻る | 「← エラー履歴に戻る」 |

### 4.3 例外表示

| ケース | 表示 |
| --- | --- |
| `eventId` が存在しない | 404 ページ |
| TTL 切れで削除済み | 同上 404（区別しない） |
| `errors:read` 権限なし | 「権限がありません」 |

---

## 5. Push 通知ペイロード仕様

### 5.1 ペイロード（本流）

| 項目 | 値 |
| --- | --- |
| `title` | `${AlarmName} (${NewStateValue})` 例: `stock-tracker-web-error-rate-prod (ALARM)` |
| `body` | CloudWatch Alarm の `NewStateReason` |
| `icon` | `/icon-192x192.png` |
| `data.url` | `${APP_URL}/errors/{eventId}?at={ISO8601 occurredAt}&serviceId={serviceId}` |
| `data.eventId` | `eventId` |
| `data.tag` | `eventId`（同一イベント Push の重複表示抑止に利用可能） |

### 5.2 サービスワーカー側の挙動

- `push` イベントで `notification.show()` を呼び、`title` / `body` / `icon` / `data` を表示
- `notificationclick` で `data.url` を新しいタブまたは既存タブで開く

### 5.3 自己監視ペイロード

自己監視アラーム（新システム自身の障害）は同一の `/api/notify/sns` を通るが、**本流とは別の SNS Topic**（`nagiyu-admin-self-monitoring-{env}`）から到達する。このペイロードは本流と異なり、`data.url` は `/dashboard` 固定（永続化を行わないため）。

---

## 6. ダッシュボードへの導線追加

### 6.1 「エラー履歴」カード

`hasPermission(user.roles, 'errors:read')` のときに表示。

| 要素 | 内容 |
| --- | --- |
| 見出し | 「エラー履歴」 |
| 説明 | 「プラットフォーム上で発生したエラー通知の履歴を確認できます」 |
| ボタン | 「エラー履歴を表示」→ `/errors` |

---

## 7. API（公開）

### 7.1 GET `/api/errors`

| 項目 | 値 |
| --- | --- |
| 認可 | NextAuth セッション + `errors:read` |
| クエリ | `serviceId?`, `from?`（ISO-8601）, `to?`, `limit?`（1〜100、既定 50）, `cursor?` |
| 200 レスポンス | `{ items: ErrorEvent[], nextCursor: string \| null }` |
| 400 | パラメータ不正 |
| 401/403 | 認証/認可エラー |

### 7.2 GET `/api/errors/{eventId}`

| 項目 | 値 |
| --- | --- |
| 認可 | NextAuth セッション + `errors:read` |
| クエリ | `at`（必須、ISO-8601）, `serviceId`（必須） |
| 200 レスポンス | `ErrorEvent`（context 含む） |
| 404 | 該当なし or TTL 削除済み |

---

## 8. 関連ドキュメント

- 要件定義: `docs/services/admin/requirements.md`
- アーキテクチャ・ADR: `docs/services/admin/architecture.md`
- ErrorEvents SDK: `docs/libs/aws/README.md`
