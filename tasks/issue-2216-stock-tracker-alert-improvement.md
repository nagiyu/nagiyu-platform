# Stock Tracker アラート改善

## 概要

Stock Tracker のアラート編集機能に複数のバグが存在する。通知タイトル・本文の状態管理設計を見直し、バグを修正するとともに、サーバー側のフォールバック処理を廃止して設計をシンプル化する。

## 関連情報

- Issue: #2216
- タスクタイプ: サービスタスク（stock-tracker）
- マイルストーン: v6.3.0

## 問題点

### 1. フリーズ問題

アラートモーダルで通知本文のテキストフィールドを編集すると、モーダルがフリーズし、保存ボタンや他のセレクトボックスが機能しなくなる。

**原因仮説**: `AlertSettingsModal.tsx`（1604 行）は多数の `useState` フックを持ち、各入力のたびに全コンポーネントが再レンダリングされる。チャート可視化（`useMemo` でアラートライン計算）が高コストな処理を毎レンダリングで引き起こしている可能性がある。また、通知本文フィールドの変更が `formData` オブジェクト全体の再構築を連鎖的に起こしている可能性もある。

### 2. デフォルト値が更新されない

モーダルを開いた後、条件モードや目標価格を変更しても、通知本文のデフォルト値が変わらない。

**原因**: `buildFormData()` はモーダルを開く際の `useEffect` でのみ呼び出される。価格・条件変更を監視する `useEffect` が存在しないため、入力後に通知タイトル・本文が自動更新されない。

### 3. 編集内容が保存されない

既存アラートのタイトル・本文を編集して保存しても、モーダルを再度開くと元の値に戻っている。

**原因仮説**: 以下の点を調査・検証する必要がある。
- PUT API の `notificationTitle`/`notificationBody` 処理（`trim() || undefined` パターン）が意図通りに動作しているか
- 条件更新ロジックとの干渉がないか
- `mapAlertToResponse` で `notificationTitle`/`notificationBody` が正しく含まれるか

## 要件

### 機能要件

- FR1: 通知タイトルが空の場合、クライアント側でバリデーションエラーを表示する
- FR2: 通知本文が空の場合、クライアント側でバリデーションエラーを表示する
- FR3: POST/PUT リクエストで通知タイトルが空の場合、サーバーはエラーを返す
- FR4: POST/PUT リクエストで通知本文が空の場合、サーバーはエラーを返す
- FR5: 条件モード（single/range）を変更した時、通知本文を自動更新する
- FR6: 目標価格・最小価格・最大価格を変更した時、通知本文を自動更新する
- FR7: アラートの編集内容（タイトル・本文）が正しくサーバーに保存・反映される
- FR8: サーバー側のフォールバック処理（空の場合に自動生成）を削除する

### 非機能要件

- NFR1: テキスト入力操作がスムーズで、フリーズが発生しない
- NFR2: テストカバレッジ 80% 以上を維持する
- NFR3: エラーメッセージは日本語で `ERROR_MESSAGES` オブジェクトに定数化する

## 実装方針

### フリーズ問題の対応

`AlertSettingsModal.tsx` のパフォーマンス問題を調査・修正する。

- 通知本文 TextField の `onChange` が `formData` 全体の再構築を引き起こしていないか確認する
- チャートの `useMemo` 依存配列を見直し、通知フィールドの変更がチャート再計算を引き起こさないようにする
- 状態管理の最適化（`useCallback`・`useMemo` の活用）を検討する
- 通知入力フィールドを別コンポーネントに切り出すことも選択肢として検討する

### 条件・価格変更時の通知本文自動更新

`useEffect` を追加し、条件モードや価格変更時に `getDefaultNotificationText()` を呼び出して通知タイトル・本文を上書きする。

- Issue #2216 の方針: 「条件や目標価格を変えた時は、アラート本文の状態に関わらず上書きする」
- 状態遷移が複雑になりすぎる場合は「デフォルト本文を設定する」ボタンの追加を検討する

### バリデーション強化

**クライアント側** (`AlertSettingsModal.tsx`):
- `validateForm()` に `notificationTitle` と `notificationBody` の必須チェックを追加する
- 空文字の場合はフォームエラーを表示してサブミットをブロックする

**サーバー側** (`alerts/route.ts`, `alerts/[id]/route.ts`):
- POST エンドポイント: `notificationTitle`/`notificationBody` が空・未定義の場合は 400 エラーを返す
- PUT エンドポイント: `notificationTitle`/`notificationBody` が空文字の場合は 400 エラーを返す
- フォールバック処理（`NotificationTitle` が空の場合に自動生成する処理）を削除する

### 編集保存問題の修正

調査結果をもとに修正方針を決定する。主な確認ポイントは以下の通り。
- PUT API でのデータ更新が DynamoDB に正しく反映されるか
- `fetchAlerts()` の結果に更新済みの `notificationTitle`/`notificationBody` が含まれるか

## タスク

### フェーズ 1: 調査・根本原因特定

- [ ] T001: フリーズ問題の原因を特定する（コードレビューまたは React DevTools でのプロファイリング）
- [ ] T002: 編集内容が保存されない問題の根本原因を特定する（PUT API ・ DynamoDB 処理・フロントエンドのデータ更新フローを確認）

### フェーズ 2: バグ修正

- [ ] T003: フリーズ問題を修正する（パフォーマンス最適化）
- [ ] T004: 編集内容が保存されない問題を修正する

### フェーズ 3: 設計改善

- [ ] T005: 条件・価格変更時に通知タイトル・本文を自動更新する `useEffect` を追加する
- [ ] T006: クライアント側の `validateForm()` に通知タイトル・本文の必須バリデーションを追加する
- [ ] T007: サーバー側（POST/PUT）に通知タイトル・本文の必須チェックを追加する
- [ ] T008: サーバー側のフォールバック処理を削除する
- [ ] T009: `ERROR_MESSAGES` に通知タイトル・本文の必須エラーメッセージを追加する
- [ ] T010: UI のヘルパーテキストを「必須」に合わせて更新する（現在は「任意」と表示）
- [ ] T011: 既存アラートのマイグレーション対応を行う（`NotificationTitle`/`NotificationBody` が未設定のデータに対してデフォルト値を設定する）

### フェーズ 4: テスト更新

- [ ] T012: `AlertSettingsModal` の単体テストに必須バリデーションケースを追加する
- [ ] T013: POST/PUT API の単体テストに通知タイトル・本文の空文字エラーケースを追加する
- [ ] T014: 条件・価格変更時の通知本文自動更新に関するテストを追加する

## 影響ファイル

- `services/stock-tracker/web/components/AlertSettingsModal.tsx` - バリデーション・`useEffect` 追加、パフォーマンス最適化
- `services/stock-tracker/web/app/api/alerts/route.ts` - 必須バリデーション追加、フォールバック削除
- `services/stock-tracker/web/app/api/alerts/[id]/route.ts` - 必須バリデーション追加
- `services/stock-tracker/web/lib/error-messages.ts` - エラーメッセージ追加
- `services/stock-tracker/web/tests/unit/components/alert-settings-modal-*.test.ts` - テスト更新
- `services/stock-tracker/web/tests/unit/api/` - API テスト更新

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md`
- `docs/services/stock-tracker/api-spec.md`
- `docs/services/stock-tracker/architecture.md`
- `docs/development/rules.md`

## 備考・未決定事項

- フリーズ問題の根本原因は T001 の調査後に確定する
- 「条件変更時に本文を常に上書き」する仕様では、ユーザーが手動で入力した内容が意図せず上書きされる可能性がある。「デフォルト値に戻す」ボタンの追加も選択肢として残す（Issue #2216 より）
- 通知タイトル・本文を必須にすることで、既存の「任意（未入力の場合は自動生成）」という動作が変わる。既存アラートで `NotificationTitle`/`NotificationBody` が未設定のものは必ず対応が必要（T011 参照）。DynamoDB のデータを確認し、未設定データに対してデフォルト値を設定するマイグレーションスクリプトの作成または一括更新処理を実施すること。
