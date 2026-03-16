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
  更新式を追加する
- 値が `undefined` の場合は `REMOVE` 式で属性を削除する
  （ただし、方針1 でサーバー側バリデーションを強化すれば、undefined が渡るケースは減る）

### 方針3: クライアント側バリデーション強化

- `AlertSettingsModal.tsx` のバリデーション処理に `notificationTitle`・`notificationBody` の
  必須チェックを追加する（空文字はエラー）

### 方針4: 条件・価格変更時の通知本文自動更新

- 条件（`conditionMode`・`operator`・`rangeType`）または価格（`targetPrice`・`minPrice`・`maxPrice`）
  が変化したとき、`notificationBody` の状態に関わらずデフォルト本文で上書きする
- 実装アプローチ（いずれかを選択）:
    - **アプローチA**: 各価格・条件の onChange ハンドラで `getDefaultNotificationText` を呼び出し、
      `setNotificationBody` を更新する
    - **アプローチB**: 価格・条件に依存する `useMemo` でデフォルト本文を計算し、
      ユーザーが本文を手動編集していない場合のみ自動更新する（手動編集フラグを別途管理）
    - **アプローチC（フォールバック）**: 状態遷移が複雑になる場合は、
      「デフォルト本文に戻す」ボタンを UI に追加し、ユーザーが手動でリセットできるようにする
- Issue の方針では「アラート本文の状態に関わらず上書きする」（アプローチA）が基本だが、
  UX の観点で問題が生じればアプローチC を検討する

### 方針5: フリーズ問題の対処（優先度: 低）

- 根本対応: 18 個以上の `useState` を `useReducer` またはフォームライブラリ（react-hook-form 等）に
  統合し、再レンダリングを抑制する（大規模リファクタリングのため別 Issue での対応を推奨）
- 暫定対応: `notificationBody` の `TextField` を `React.memo` 化または独立した子コンポーネントに
  分離して再レンダリング範囲を限定する
- 方針1〜4 の対応でフリーズが解消する可能性もあるため、対応後に再確認する

## タスク

### フェーズ1: コア層（必須前提）

- [ ] T001 `core/src/validation/index.ts` に `notificationTitle`・`notificationBody` の
      必須バリデーションを追加（空文字・空白のみはエラー）
- [ ] T002 `core/src/repositories/dynamodb-alert.repository.ts` の `update()` に
      `NotificationTitle`・`NotificationBody` の SET/REMOVE 更新式を追加
- [ ] T003 `tests/unit/validation/` に T001 の追加バリデーションに対応するテストを追加

### フェーズ2: サーバー層

- [ ] T004 `web/app/api/alerts/route.ts`（POST）の `NotificationTitle`・`NotificationBody` 処理を
      `|| undefined` フォールバックから必須チェック＋エラーレスポンスに変更
- [ ] T005 `web/app/api/alerts/[id]/route.ts`（PUT）も同様に修正

### フェーズ3: フロントエンド

- [ ] T006 `web/components/AlertSettingsModal.tsx` のバリデーション処理に
      `notificationTitle`・`notificationBody` の必須チェックを追加
- [ ] T007 条件・目標価格変更時（各 onChange）に `getDefaultNotificationText` を呼び出し、
      `notificationBody` を上書きするロジックを実装（アプローチA 優先）
- [ ] T008 フリーズ問題の再現確認を実施し、T001〜T007 の対応後も継続する場合は
      `notificationBody` TextField の分離またはメモ化を検討

### フェーズ4: テストと動作確認

- [ ] T009 `tests/unit/components/alert-validation.test.ts` に T006 のバリデーション追加分のテストを追加
- [ ] T010 `tests/e2e/alert-management.spec.ts` に以下のシナリオを追加・確認:
    - 既存アラートのタイトル・本文を編集して保存し、再度開いたときに反映されていること
    - 条件や目標価格を変更したとき通知本文が自動更新されること
    - タイトルまたは本文を空にして保存しようとするとエラーになること

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md`
- `docs/services/stock-tracker/api-spec.md`
- `docs/development/rules.md`
- `docs/development/testing.md`

## 備考・未決定事項

- 方針4 のアプローチ（A/B/C）は実装時に UX を考慮して最終決定する
- バグ1（フリーズ）の大規模リファクタリング（useReducer 化）は別 Issue での対応を推奨
- 通知タイトル・本文を必須にすることで、既存の `notificationTitle`・`notificationBody` が
  `undefined` のアラートが存在する場合、既存データとの互換性を確認すること
