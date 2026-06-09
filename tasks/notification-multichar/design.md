# 通知アーキテクチャのマルチキャラ対応 — design（技術設計 / Phase 分割）

ベースブランチ: `integration/3491-notification-multichar`（develop 分岐）
各 Phase = サブエージェント実装 + 小さい Draft PR（→ integration をターゲット）。

---

## Phase A: データ土台（core）

「characterId を保持・読み書きできる」状態を作る。生成・配信の挙動は変えない（後方互換）。

### A-1. `NotificationEvent` に characterId 追加

- `entities/notification-event.entity.ts`: `CharacterID: string;` を追加（必須）。
  - `CreateNotificationEventInput` も追従（Omit<…, 'CreatedAt'> のまま CharacterID 必須）。
- `mappers/notification-event.mapper.ts`:
  - `toItem`: `CharacterID` を書き込む。
  - `toEntity`: `item.CharacterID` を読む。**欠落時は `DEFAULT_CHARACTER_ID` を補う**（後方互換）。
    - `validateStringField` は欠落で throw するため、`item.CharacterID !== undefined ? validate… : DEFAULT_CHARACTER_ID` とする。
- repository interface / dynamodb / in-memory: 型追従のみ（SK 不変なので Query ロジックは変更不要）。

### A-2. 全キャラ ID 一覧 API（core）

- `characters/index.ts` に全キャラ定義の配列と `getAllCharacterIds()` を追加。
  - 例: `export const CHARACTER_DEFINITIONS = [hiyori, ageha];`
  - `export function getAllCharacterIds(): string[]` / `getCharacterDefinitionById(id)`。
  - batch から参照できるよう core バレル（`@nagiyu/livetalk-core`）に re-export。

### A-3. message-builder のキャラ化

- `notification/message-builder.ts`: `CHAR_NAME = 'ひより'` を排除。
  - `BuildNotificationMessageInput.characterDisplayName`（既存フィールド）を必須化 or 使用。
  - `buildCriticalNotificationMessage(knowledgeTopic, characterDisplayName)` に拡張。
  - タイトル = `${characterDisplayName}より` / `…より（重要）`。

### A テスト

- mapper: characterId round-trip / 欠落時 default 補完。
- message-builder: displayName 差し込み（ひより/アゲハ両方）。
- 既存テストの更新（CharacterID 必須化に伴う固定値追加）。

---

## Phase B: 生成側（batch + core/decision）

全キャラ生成 + 2 段ゲート調停。

### B-1. notify.usecase の全キャラ化

- `processUser` を「characterId 固定」から「全キャラ走査」へ。
  - 各キャラについて lifecycle 取得 → 無ければ skip。
  - messages / knowledge / interest をキャラ単位で取得し、`shouldNotifyNow` に
    **そのキャラの NotificationEvent 履歴のみ**を渡す（characterId フィルタ）。
  - 発火候補（kind, characterId, 文面材料）を収集する。
- **ユーザー総量調停**（新規・純粋関数を core に）:
  - critical 候補: 各キャラ独立で送る（独立 cap）。
  - normal 候補: ユーザー総量 cap 内で 1 体選抜。
    - 選抜基準: 「直近に通知した時刻が最も古い（または未通知）キャラ」を優先（公平性）。
    - cap 算出はユーザー全体の履歴ベースで既存 `computeDailyNormalCap` を踏襲。
- `notifEventRepo.put` 時に `CharacterID` を記録。push payload にも characterId を載せる（B-2）。

### B-2. push payload に characterId

- `notify.usecase` の payload を `{ title, body, data: { url: \`/?character=${characterId}\`, characterId } }` に。
- `@nagiyu/common/push` の `NotificationPayload.data` は `Record<string, unknown>` なので型変更不要。
  - ただし characterId を型で表現したいなら `types.ts` に optional フィールド追加を検討（任意）。

### B-3. decision の調停ヘルパ

- `notification/decision.ts`（or 新ファイル）に「normal 候補から 1 体選抜」の純粋関数を追加。
- countTodayNotifications / missedCount はキャラ単位履歴で正しく動くことを担保。

### B テスト

- notify.usecase: 複数キャラで lifecycle あり → 各キャラ判定が独立に走る。
  - normal が複数キャラで発火資格 → 1 体だけ選抜される。
  - critical は複数キャラ独立で送られる。
  - キャラ単位履歴フィルタが効いている（他キャラの通知が cap/interval に影響しない）。
- 選抜純粋関数の単体テスト。

---

## Phase C: 配信・消化（web + sw）

起動経路で出し分け + クロス汚染防止。

### C-1. service worker

- `public/sw.js`: click 遷移は `data.url`（`/?character=<id>`）をそのまま使う（payload 側で設定済み）。
  - デフォルト文面の `'ひより'` ハードコードも見直し（汎用文 or payload 必須前提に）。

### C-2. first-word API

- `GET /api/push/first-word?characterId=<id>`:
  - characterId 指定時: そのキャラの未消化最新を返す（characterId 一致でフィルタ）。
  - 省略時: 後方互換のためカレント概念が無いので、**未消化を characterId ごとに集約**して返す
    形に拡張するか、`pending` を別 API にするかを実装時に確定。
  - レスポンスに `characterId` を含める。
- listByUser は全件返すので、API 側で `e.CharacterID === characterId && e.ConsumedAt === undefined` フィルタ。

### C-3. page.tsx（起動経路で出し分け）

- URL の `?character=<id>` を読む（push クリック起動）:
  - そのキャラを `setCharacterId` でカレントに設定。
  - first-word をそのキャラで取得 → 第一声表示 → consume。
- character クエリなし（自前起動）:
  - カレントキャラの未消化を first-word で取得 → あれば第一声。
  - カレント以外に未消化があれば「○○から連絡」提示（即 consume しない）。選択で切替＆表示＆consume。
- knowledgeId は **カレント == 通知元** のときのみ chat に渡す（既存の `firstWordKnowledgeIdRef` に
  characterId ガードを追加）。

### C テスト

- first-word route: characterId フィルタ / 欠落 default。
- page.test: URL クエリ起動でカレント切替 + 第一声。自前起動で提示。クロス汚染ガード。

---

## レイヤー依存・規約の注意

- libs（common/push）ではパスエイリアス禁止・相対 import。エラーメッセージ日本語 + 定数化。
- UI（components/app）とロジック（lib/core）の分離を維持。
- core → batch / web の一方向依存を保つ。
- カバレッジ 80% 以上（Jest coverageThreshold）。

## dev 検証（各 Phase 後 / 特に C 後）

- アゲハ由来の通知が生成・配信されること。
- push クリックでアゲハが開きアゲハが第一声を喋ること。
- カレント=ひよりで起動 → アゲハ未消化が「提示」され、切替えるまで消えないこと。
- knowledgeId が別キャラ会話に混入しないこと。
