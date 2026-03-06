# アラートのパーセンテージ保持

## 概要

アラートをパーセンテージで設定した際、パーセンテージ情報（モード・値）が保持されず、
計算後の価格値のみが保存されていた問題を修正する。

編集時にパーセンテージ条件を復元・変更できるようにする。

## 関連情報

- タスクタイプ: サービスタスク（stock-tracker）

## 要件

### 機能要件

- FR1: アラート条件をパーセンテージで設定した場合、`isPercentage` フラグ・`percentageValue`・`basePrice` を保持する
- FR2: アラート一覧・詳細 API がパーセンテージ情報（`basePrice` を含む）を返す
- FR3: アラート編集時、パーセンテージで作成された条件の場合は入力方式を「パーセンテージ」に復元して表示する
- FR4: アラート編集時、パーセンテージ条件の場合はパーセンテージ値を変更できる
- FR5: 範囲指定アラートでもパーセンテージ情報を保持・復元する
- FR6: アラート編集時、単一条件・範囲指定を問わず、手動入力とパーセンテージの入力方式を自由に切替えて編集できる

### 非機能要件

- NFR1: 既存の手動入力アラートの動作に影響しない
- NFR2: テストカバレッジ 80% 以上を維持する

## 実装方針

### `basePrice` を condition に持つ方式（シンプル設計）

パーセンテージ編集の基準価格を `AlertCondition.basePrice` に保持する。
こうすることで：

- `alerts/page.tsx` から基準価格の取得や計算が不要になる
- サマリーの最新 close へのフォールバックが不要になる
- 条件自体が基準価格を持つためシンプルに復元できる

`alerts/page.tsx` では `condition.basePrice` を参照し、後方互換として
`isPercentage=true` かつ `percentageValue` がある場合は `value / (1 + percentageValue / 100)` で逆算する。

## 変更対象ファイル

1. `services/stock-tracker/core/src/entities/alert.entity.ts`
    - `AlertCondition` に `basePrice?: number` フィールドを追加
2. `services/stock-tracker/web/types/alert.ts`
    - Web 側の `AlertCondition` 型に `basePrice?: number` を追加
3. `services/stock-tracker/web/app/api/alerts/route.ts`
    - `AlertResponse` の conditions 型に `basePrice` を追加
4. `services/stock-tracker/web/app/api/alerts/[id]/route.ts`
    - `AlertResponse` の conditions 型に `basePrice` を追加
    - PUT エンドポイントで全条件（単一・範囲）をインデックス対応でマージ
    - マージ時に `basePrice` を対応
5. `services/stock-tracker/web/components/AlertSettingsModal.tsx`
    - 作成時: パーセンテージモードの場合に `basePrice` を条件に含める
    - 編集時（単一）: 入力方式の自由切替を可能にする（`disabled` 制約を削除）
    - 編集時（範囲）: 入力方式・パーセンテージ・価格フィールドの `disabled` 制約を削除
    - 編集時（範囲）: 「条件は編集できません」Info メッセージを削除
    - `handleSubmit` 編集時: 範囲指定モードの条件更新に対応
    - 編集モードのバリデーション: 範囲指定モードにも対応
6. `services/stock-tracker/web/app/alerts/page.tsx`
    - 編集モーダルに `basePrice` を渡す（`condition.basePrice` 参照、後方互換逆算あり）

## タスク

- [x] T001: `AlertCondition` エンティティにパーセンテージフィールドを追加
- [x] T002: `AlertCondition` 型を core パッケージからエクスポート
- [x] T003: Web 型定義の `AlertCondition` を更新
- [x] T004: API レスポンス型を更新（GET/POST/PUT）
- [x] T005: PUT API の条件マージ処理をパーセンテージ対応に更新
- [x] T006: `AlertSettingsModal` の作成処理でパーセンテージ情報を送信
- [x] T007: `AlertSettingsModal` の編集モードでパーセンテージ情報を復元（state 復元）
- [x] T008: `AlertSettingsModal` の編集モードで単一条件のパーセンテージ変更を可能にする
- [x] T009: mapper テストにパーセンテージ往復変換テストを追加
- [x] T010: AlertSettingsModal モードテストにパーセンテージ編集復元テストを追加
- [x] T011: `AlertCondition` に `basePrice` フィールドを追加し作成時に保存する
- [x] T012: `alerts/page.tsx` の編集モーダルに `basePrice` を渡す（条件から取得）
- [x] T013: `AlertSettingsModal.tsx` の単一条件モードで入力方式を自由に切替えられるようにする
- [x] T014: `AlertSettingsModal.tsx` の範囲指定モードで入力方式・価格・パーセンテージ値を編集可能にする
- [x] T015: `AlertSettingsModal.tsx` の handleSubmit で範囲指定モードの条件更新に対応
- [x] T016: `AlertSettingsModal.tsx` の編集モードバリデーションで範囲指定に対応
- [x] T017: `[id]/route.ts` の PUT 処理で全条件（範囲含む）のマージと `basePrice` に対応
- [x] T018: ユニットテストを追加・更新（mapper `basePrice` 往復変換、モーダル範囲編集テスト）

## 参考ドキュメント

- `docs/development/rules.md`
- `docs/development/architecture.md`

