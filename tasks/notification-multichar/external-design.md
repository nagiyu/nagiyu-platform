# 通知アーキテクチャのマルチキャラ対応 — external design（体験・外部仕様）

## 1. 生成（notify バッチ）

### キャラ単位判定 + ユーザー総量調停（2 段ゲート）

1. ユーザーごとに、登録済み全キャラを対象に**キャラ単位**で発火判定する。
   - lifecycle / messages / knowledge / interest は **そのキャラの分**を参照する。
   - `shouldNotifyNow` に渡す `notificationEvents` は **そのキャラの履歴のみ**（characterId フィルタ）。
   - これによりキャラごとの会話間隔・missedCount・backoff が正しく効く。
2. 発火資格を得たキャラ集合のうち、**ユーザー総量 cap** で出すものを絞る。
   - **normal**: ユーザー全体で 1 回/バッチに 1 体だけ選抜。選抜基準 =
     「直近に通知していないキャラを優先（公平性）」を基本とする。
   - **critical**: キャラ独立。緊急性が高いので各キャラ独立 cap（`NOTIFY_DAILY_CRITICAL_CAP`）で送る。
   - 1 日上限（`NOTIFY_DAILY_NORMAL_CAP*`）はユーザー総量として維持する
     （= 既存の体感頻度を壊さない。キャラ数倍にしない）。

### 文面のキャラ化

- `message-builder` の `ひより` ハードコードを排除し、`CharacterDefinition.displayName` を差し込む。
- タイトルは `${displayName}より` / `${displayName}より（重要）`。
- 本文テンプレートはキャラ共通の汎用文を維持しつつ、固有名詞をキャラ名に置換。
  - 口調の作り込み（キャラごとの語尾等）は深さ(3)の宿題とし、本フェーズは displayName 差し込みまで。

## 2. 配信（push / service worker）

- push payload に `data.characterId` を追加。`data.url` を `/?character=<id>` にする。
- service worker `notificationclick`: `data.url`（= `/?character=<id>`）へ遷移。既存の navigate/openWindow ロジックは流用。
- サブスクは端末単位のまま（変更なし）。

## 3. 消化（第一声）— 起動経路で出し分け

### 3-1. push クリック起動（URL に `?character=<id>` あり）

- アプリ起動時、URL の `character` クエリを読み、そのキャラを**カレントに自動設定**する。
- そのキャラの未消化最新通知を第一声として表示し、表示時点で consume。
- knowledgeId はそのキャラの会話 context に渡す（一致しているので汚染なし）。

### 3-2. 自前起動（URL に character クエリなし）

- 未消化通知を**キャラ単位で**取得する。
  - カレントキャラに未消化があれば、それを第一声として表示（従来挙動だが characterId 一致を担保）。
  - カレント以外のキャラに未消化があれば、「○○から連絡が来てるよ」と**提示**する（即 consume しない）。
    ユーザーがそのキャラを選んで切替えたら第一声を表示し、その時点で consume。
- consume は characterId 単位。別キャラに切替えても、まだ表示していないキャラの通知は残る（C3 解消）。

### 3-3. クロス汚染防止（C2）

- 第一声の knowledgeId を chat に渡すのは、**カレントキャラ == 通知元キャラ**のときのみ。
- 不一致の状態で送信した場合は knowledgeId を渡さない。

## 4. API 外部仕様の変更

- `GET /api/push/first-word`
  - クエリ `?characterId=<id>` を受け付け、指定時はそのキャラの未消化最新を返す。
  - レスポンスに `characterId` を含める。
  - 省略時の挙動（全キャラ横断 / カレント単位）は design.md で確定。
- `PATCH /api/push/consumed`
  - 既存の notifId 指定のまま（NotifID は characterId をまたいで一意なので変更不要）。
- 新規の可能性: `GET /api/push/pending`（自前起動時に未消化キャラ一覧を返す）。
  - 必要性は design.md で判断（first-word の拡張で兼ねられるか）。

## 5. 後方互換

- characterId 欠落の既存 NotificationEvent は legacy として `DEFAULT_CHARACTER_ID`（hiyori）とみなす。
  - first-word のフィルタ・mapper の読み出しで欠落時 default を補う。
- TTL 30 日で旧データは自然消滅するため、移行スクリプトは不要。
