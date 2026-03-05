# アラートのパーセンテージ保持

## 概要

アラートをパーセンテージで設定した際、パーセンテージ情報（モード・値）が保持されず、
計算後の価格値のみが保存されていた問題を修正する。

編集時にパーセンテージ条件を復元・変更できるようにする。

## 関連情報

- タスクタイプ: サービスタスク（stock-tracker）

## 要件

### 機能要件

- FR1: アラート条件をパーセンテージで設定した場合、`isPercentage` フラグと `percentageValue` を保持する
- FR2: アラート一覧・詳細 API がパーセンテージ情報を返す
- FR3: アラート編集時、パーセンテージで作成された条件の場合は入力方式を「パーセンテージ」に復元して表示する
- FR4: アラート編集時、パーセンテージ条件の場合はパーセンテージ値を変更できる
- FR5: 範囲指定アラートでもパーセンテージ情報を保持・復元する

### 非機能要件

- NFR1: 既存の手動入力アラートの動作に影響しない
- NFR2: テストカバレッジ 80% 以上を維持する

## 実装の概要

### 変更対象ファイル

1. `services/stock-tracker/core/src/entities/alert.entity.ts`
    - `AlertCondition` に `isPercentage?: boolean` と `percentageValue?: number` フィールドを追加
2. `services/stock-tracker/core/src/index.ts`
    - `AlertCondition` 型を公開エクスポートに追加
3. `services/stock-tracker/web/types/alert.ts`
    - Web 側の `AlertCondition` 型に同様のフィールドを追加
4. `services/stock-tracker/web/app/api/alerts/route.ts`
    - `AlertResponse` のconditions型にパーセンテージフィールドを追加
5. `services/stock-tracker/web/app/api/alerts/[id]/route.ts`
    - `AlertResponse` の conditions 型更新
    - PUT エンドポイントの条件マージ処理にパーセンテージフィールドを対応
6. `services/stock-tracker/web/components/AlertSettingsModal.tsx`
    - 作成時: パーセンテージモードの場合に `isPercentage`/`percentageValue` を API リクエストに含める
    - 編集時: `isPercentage=true` の条件を入力方式「パーセンテージ」で復元
    - 編集時: パーセンテージ値の変更を可能にする

### データ永続化

`AlertMapper` は `ConditionList` を DynamoDB にそのまま保存するため、
`AlertCondition` に追加したオプションフィールドは自動的に保持される。
マッパー本体の変更は不要。

## タスク

- [x] T001: `AlertCondition` エンティティにパーセンテージフィールドを追加
- [x] T002: `AlertCondition` 型を core パッケージからエクスポート
- [x] T003: Web 型定義の `AlertCondition` を更新
- [x] T004: API レスポンス型を更新（GET/POST/PUT）
- [x] T005: PUT API の条件マージ処理をパーセンテージ対応に更新
- [x] T006: `AlertSettingsModal` の作成処理でパーセンテージ情報を送信
- [x] T007: `AlertSettingsModal` の編集モードでパーセンテージ情報を復元
- [x] T008: `AlertSettingsModal` の編集モードでパーセンテージ変更を可能にする
- [x] T009: mapper テストにパーセンテージ往復変換テストを追加
- [x] T010: AlertSettingsModal モードテストにパーセンテージ編集復元テストを追加

## 参考ドキュメント

- `docs/development/rules.md`
- `docs/development/architecture.md`
