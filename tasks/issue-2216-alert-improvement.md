# Stock Tracker アラート改善

## 概要

Stock Tracker のアラート編集機能に複数のバグが存在する。
調査の結果、DynamoDB リポジトリ層の欠陥・フロントエンドの状態管理ロジックの問題・バリデーション不足の3点が根本原因として特定された。

## 関連情報

- Issue: #2216
- 関連 Issue: #2217（タスクドキュメント作成）、#2218（実装）、#2219（クリーンアップ）
- タスクタイプ: サービスタスク（stock-tracker）
- マイルストーン: v6.3.0

## 調査結果

### バグ1: アラート本文編集時のフリーズ

**症状**: モーダルで本文を編集しているとフリーズし、保存ボタンや他のセレクトボックスが機能しなくなることがある。

**原因**: `AlertSettingsModal.tsx`（1,605 行）は 18 個以上の独立した `useState` フックを持ち、
`formData` オブジェクトをレンダリング毎に全ステート変数から再構築している。
通知本文の `TextField`（multiline）は入力のたびに `setNotificationBody` を呼び出し、
コンポーネント全体の再レンダリングを引き起こす。
この過剰な再レンダリングが UI のフリーズや操作不能を招く可能性がある。

### バグ2: 条件・目標価格変更時にデフォルト本文が更新されない

**症状**: 条件や目標価格を変更しても、アラート本文のデフォルト値が変わらない。

**原因（コード箇所: `AlertSettingsModal.tsx` の `buildFormData` 関数）**:

```
notificationBody: nextFormData.notificationBody || defaultNotificationText.body
```

- 編集モードでは `nextFormData.notificationBody` に `editTarget.notificationBody` が設定されるため、
  常に既存値が優先され、デフォルト値で上書きされない。
- さらに `useEffect` は `open`・`mode`・`tradeMode`・`editTarget`・`defaultTargetPrice`・`tickerId`
  が変化したときのみ実行され、モーダル内部での条件/価格変更では実行されない。
  そのため、ユーザーが条件や目標価格を変えても `notificationBody` が再計算されない。

### バグ3: 既存アラートの通知タイトル・本文の編集が保存されない

**症状**: 既存アラートのタイトル・本文を編集して保存しても、再度開くと元に戻っている。

**原因（根本的な実装漏れ）**: `dynamodb-alert.repository.ts` の `update()` メソッドが
`NotificationTitle` / `NotificationBody` を DynamoDB の更新式に含めていない。

```
// 更新式を動的に構築
if (updates.TickerID !== undefined)       { ... }
if (updates.ExchangeID !== undefined)     { ... }
// ...
// ❌ NotificationTitle / NotificationBody の更新式が存在しない
```

サーバー側の PUT ハンドラ（`/api/alerts/[id]/route.ts`）では `updates.NotificationTitle` に値を
セットしているが、リポジトリ層でそれが無視されるため DynamoDB には書き込まれない。

**副次的問題**: サーバー側の PUT ハンドラおよび POST ハンドラは
`body.notificationTitle.trim() || undefined` という処理で、
トリム後に空文字列になる場合（空文字・空白のみ）を `undefined` に変換している。
バリデーションエラーを返さずサイレントにフォールバックしており、
フロントエンドでも空チェックが行われていない。

## 対応方針

Issue #2216 の方針に従い、以下の設計変更を行う。

### 方針1: サーバー側フォールバックの廃止とバリデーション強化

- `notificationTitle`・`notificationBody` が空の場合はエラーを返す（`undefined` への変換を廃止）
- POST・PUT どちらのハンドラも同様に対応する
- バリデーション関数（`core/src/validation/index.ts`）にタイトル・本文の必須チェックを追加する

### 方針2: DynamoDB リポジトリの修正（バグ3 の根本対処）

- `dynamodb-alert.repository.ts` の `update()` に `NotificationTitle` / `NotificationBody` の
  `SET` 更新式を追加する
- `REMOVE` 式は不要。理由:
    - 方針1・方針3 のバリデーション（サーバー・クライアント双方）で空値は事前に弾くため、
      リポジトリ層に `undefined` が到達しない
    - 調査結果: 現状はフロントエンドが `formData.notificationTitle.trim()` を送信し、
      サーバー側が `body.notificationTitle.trim() || undefined` でトリム後の空文字列を `undefined` に
      変換している。方針1 でこのサーバー側変換を廃止してバリデーションエラーに切り替え、
      方針3 でクライアント側も空値を送信しないようにすることで、`undefined` の到達経路は消滅する

### 方針3: クライアント側バリデーション強化

- `AlertSettingsModal.tsx` のバリデーション処理に `notificationTitle`・`notificationBody` の
  必須チェックを追加する（空文字はエラー）

### 方針4: 条件・価格変更時の通知本文自動更新（方針5 と統合）

- 条件（`conditionMode`・`operator`・`rangeType`）または価格（`targetPrice`・`minPrice`・`maxPrice`）
  が変化したとき、確認ダイアログを表示し、ユーザーが許可した場合のみ通知本文をデフォルト値で上書きする
- **方針5 を採用するため、アプローチA（8箇所 onChange 修正）は不採用**
- 編集済みフラグによる分岐は設けない（ユーザーが本文を変えていようが変えていまいが常にダイアログを表示）
- 将来的にユーザビリティが悪いと判断された場合はその時点で改善を検討する

#### 確認ダイアログの仕様

- タイトル例: 「通知本文を更新しますか？」
- 本文例: 「条件または価格が変更されました。現在の通知本文をデフォルト値で上書きしますか？」
- ボタン: 「上書きする」（=デフォルト本文に更新）/ 「このまま維持する」（=現在の本文を保持）

### 方針5: フリーズ問題と通知編集の分離（採用確定）

`AlertSettingsModal.tsx` が 1,605 行・18 個以上の `useState` を抱えており、
通知本文入力のたびにコンポーネント全体が再レンダリングされることがフリーズの原因と推測される。

**採用アプローチ: 通知編集を別ダイアログに分離する**

- `AlertSettingsModal.tsx` から通知タイトル・本文の `TextField` を取り除き、
  代わりに「通知設定を編集」ボタンを配置する
- ボタン押下で `NotificationEditDialog`（新規コンポーネント）を開く
- `NotificationEditDialog` は自前の `useState` でタイトル・本文を管理し、
  保存ボタン押下時のみ親コンポーネント（`AlertSettingsModal`）にコールバックで値を返す
- 主な利点:
    - 通知入力中の再レンダリングが `NotificationEditDialog` 内部に限定され、フリーズが解消する
    - 方針4 の通知本文更新が単純化される: `AlertSettingsModal` 内の通知状態変数を
      `getDefaultNotificationText` で直接上書きするだけで済む
      （`TextField` が存在しないため React batching の問題が発生しない）
    - `AlertSettingsModal` の責務が明確に分離される

## タスク

### フェーズ1: コア層（必須前提）

- [ ] T001 `core/src/validation/index.ts` に `notificationTitle`・`notificationBody` の
      必須バリデーションを追加（空文字・空白のみはエラー）
- [ ] T002 `core/src/repositories/dynamodb-alert.repository.ts` の `update()` に
      `NotificationTitle`・`NotificationBody` の `SET` 更新式を追加（`REMOVE` 不要）
- [ ] T003 `tests/unit/validation/` に T001 の追加バリデーションに対応するテストを追加

### フェーズ2: サーバー層

- [ ] T004 `web/app/api/alerts/route.ts`（POST）の `NotificationTitle`・`NotificationBody` 処理を
      `|| undefined` フォールバックから必須チェック＋エラーレスポンスに変更
- [ ] T005 `web/app/api/alerts/[id]/route.ts`（PUT）も同様に修正

### フェーズ3: フロントエンド

- [ ] T006 `web/components/AlertSettingsModal.tsx` のバリデーション処理に
      `notificationTitle`・`notificationBody` の必須チェックを追加
- [ ] T007 通知編集の別ダイアログ分離（`NotificationEditDialog` コンポーネント新規作成）:
      保存ボタン押下時のみ `AlertSettingsModal` に値を渡す構成にし、フリーズを解消する
- [ ] T008 条件・目標価格変更時の通知本文自動更新（確認ダイアログ対応）:
      - 条件・価格の onChange で確認ダイアログ（`NotificationOverwriteConfirmDialog` または MUI の `Dialog`）を表示
      - ユーザーが「上書きする」を選択した場合のみ `getDefaultNotificationText` で通知本文を更新
      - 編集済みフラグは不要（常にダイアログを表示する）

### フェーズ4: テストと動作確認

- [ ] T009 `tests/unit/components/alert-validation.test.ts` に T006 のバリデーション追加分のテストを追加
- [ ] T010 `tests/e2e/alert-management.spec.ts` に以下のシナリオを追加・確認:
    - 既存アラートのタイトル・本文を編集して保存し、再度開いたときに反映されていること
    - 条件や目標価格を変更すると、通知本文の上書き確認ダイアログが表示されること
    - 確認ダイアログで「上書きする」を選択すると通知本文がデフォルト値に更新されること
    - 確認ダイアログで「このまま維持する」を選択すると通知本文が保持されること
    - タイトルまたは本文を空にして保存しようとするとエラーになること

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md`
- `docs/services/stock-tracker/api-spec.md`
- `docs/development/rules.md`
- `docs/development/testing.md`

## 備考・未決定事項

- 方針5（通知ダイアログ分離）の採用が確定したため、アプローチA（8箇所 onChange 修正）は不採用
- 方針4 の確認ダイアログは編集済みフラグによる分岐なし。常にダイアログを表示する（シンプルな実装）
  将来的にユーザビリティ改善が必要と判断された時点で変更を検討する
- 通知タイトル・本文を必須にすることで、既存の `notificationTitle`・`notificationBody` が
  `undefined` のアラートが存在する場合、既存データとの互換性を確認すること
