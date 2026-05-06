<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/admin/external-design.md に統合して削除します。
-->

# エラー通知の永続化と集約閲覧基盤 - 外部設計

関連 Issue: [#2940](https://github.com/nagiyu/nagiyu-platform/issues/2940)

---

## 1. 画面遷移

```
[ Dashboard /dashboard ]
        │
        │  サイドナビ「エラー履歴」
        ▼
[ エラー一覧 /errors ]──────────┐
        │                        │  Push 通知タップ
        │  行クリック             │  （直接遷移）
        ▼                        ▼
[ エラー詳細 /errors/{eventId} ]
        │
        │  「一覧へ戻る」リンク
        ▼
[ エラー一覧 /errors ]
```

---

## 2. エラー一覧画面（`/errors`）

### 2.1 目的

過去に発生したエラーを時系列降順で一覧し、サービス・期間で絞り込みながら確認する。

### 2.2 表示要素

| 要素 | 内容 |
| --- | --- |
| ページタイトル | 「エラー履歴」 |
| フィルタバー | サービス（プルダウン）・期間（プリセット: 24h / 7d / 30d / カスタム） |
| エラーテーブル | 1 行 1 ErrorEvent。下記カラム |
| ページャ | 1 ページ最大 50 件、`Load more` 方式 |

### 2.3 テーブルカラム

| カラム | 内容 |
| --- | --- |
| 発生時刻 | `YYYY-MM-DD HH:mm:ss`（JST） |
| サービス | `serviceId`（Chip 表示） |
| 重大度 | `severity`（色分け Chip: critical=赤 / error=橙 / warning=黄 / info=青） |
| タイトル | `title`（CloudWatch なら AlarmName） |
| 概要 | `message` の先頭 80 文字（省略あり） |

### 2.4 認可

`errors:read` パーミッション必須。未保持時は 403 と「権限がありません」メッセージ。

### 2.5 空状態

「エラー履歴がありません」+ 期間を広げる導線。

---

## 3. エラー詳細画面（`/errors/{eventId}`）

### 3.1 目的

特定の ErrorEvent の全情報を確認する。

### 3.2 表示要素

| セクション | 内容 |
| --- | --- |
| ヘッダー | severity Chip + title |
| メタ情報カード | eventId / serviceId / source / 発生時刻（JST + UTC 両表記） |
| 本文 | `message`（複数行プレーンテキスト） |
| コンテキスト | `context` JSON を整形表示（Pre タグ + コピー機能） |
| アクション | 「一覧に戻る」 |

### 3.3 認可

`errors:read` パーミッション必須。

### 3.4 エラー状態

| ケース | 表示 |
| --- | --- |
| `eventId` が存在しない | 404「指定されたエラーは見つかりません」 |
| TTL 切れで削除済み | 同上 404（区別しない） |

---

## 4. ナビゲーション統合

`(protected)/layout.tsx` のサイドメニュー（既存に追加）:

- ダッシュボード
- **エラー履歴（新規）**
- ログアウト

---

## 5. Push 通知のペイロード変更

| 項目 | Before | After |
| --- | --- | --- |
| `data.url` | `'/dashboard'` 固定 | `'/errors/{eventId}'`（生成された eventId） |
| `title` | `${AlarmName} (${NewStateValue})` | 同左（変更なし） |
| `body` | `NewStateReason` | 同左（変更なし） |
| `icon` | `/icon-192x192.png` | 同左（変更なし） |
| `tag`（新規） | なし | `eventId`（同一イベントの重複表示抑止） |

タップ時は Service Worker が `data.url` を開く。Service Worker 自体の変更は不要（既存実装で `data.url` を尊重しているはず。実装時に再確認）。

---

## 6. エンティティ関係（簡易）

```
ErrorEvent
  ├─ serviceId            (string)
  ├─ source               (cloudwatch-alarm | application | manual)
  ├─ severity             (info | warning | error | critical)
  ├─ title                (string)
  ├─ message              (string)
  ├─ context              (string: JSON)
  ├─ occurredAt           (string: ISO-8601)
  └─ eventId              (string: ULID)
```

---

## 7. UI モックアップ（テキスト）

### 一覧ページ

```
┌────────────────────────────────────────────────────────────┐
│ エラー履歴                                                  │
├────────────────────────────────────────────────────────────┤
│ [サービス: ▼ All]  [期間: ▼ 直近24時間]                      │
├────────────────────────────────────────────────────────────┤
│ 発生時刻              サービス      重大度  タイトル / 概要  │
│ 2026-05-06 10:32:11  stock-tracker [error]  Lambda エラー率 │
│ 2026-05-06 09:15:42  stock-tracker [warning] DynamoDB スロ…│
│ 2026-05-05 23:01:09  stock-tracker [error]  Lambda Throttle │
│ ...                                                          │
│ [ もっと読み込む ]                                            │
└────────────────────────────────────────────────────────────┘
```

### 詳細ページ

```
┌────────────────────────────────────────────────────────────┐
│ ← エラー履歴に戻る                                            │
│                                                              │
│ [error] stock-tracker-web-error-rate-prod (ALARM)            │
│                                                              │
│ ┌──────────────────────────────────────────┐                │
│ │ eventId    01HQ6...                       │                │
│ │ serviceId  stock-tracker                  │                │
│ │ source     cloudwatch-alarm               │                │
│ │ 発生時刻    2026-05-06 10:32:11 JST       │                │
│ │            (2026-05-06T01:32:11Z)         │                │
│ └──────────────────────────────────────────┘                │
│                                                              │
│ ── 本文 ──                                                   │
│ Threshold Crossed: 1 out of the last 1 datapoints [0.6]…    │
│                                                              │
│ ── コンテキスト ──                                            │
│ ┌──────────────────────────────────────────┐                │
│ │ { "AlarmName": "...", "Region": "..." }   │  [Copy]        │
│ └──────────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────┘
```
