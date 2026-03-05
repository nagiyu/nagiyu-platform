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
- [x] T007: `AlertSettingsModal` の編集モードでパーセンテージ情報を復元（state 復元）
- [x] T008: `AlertSettingsModal` の編集モードで単一条件のパーセンテージ変更を可能にする
- [x] T009: mapper テストにパーセンテージ往復変換テストを追加
- [x] T010: AlertSettingsModal モードテストにパーセンテージ編集復元テストを追加

## 未対応の問題（追加タスク）

現状の調査（コードレビュー）で以下の未対応箇所を確認。

### 根本原因: `basePrice` が編集モーダルに渡されていない

`alerts/page.tsx` の編集モーダルに `basePrice` が渡されていないため、
パーセンテージUIが全く表示されない（`{basePrice && basePrice > 0 && (...)}` 条件で非表示）。
新規作成モーダル（summaries/page.tsx, holdings/page.tsx）は正しく `basePrice` を渡している。

### 範囲指定モードのパーセンテージ編集が無効

編集モーダルで範囲指定アラートを開いた場合:
- 入力方式の Select が `disabled={mode === 'edit'}` で完全に無効化されている
- パーセンテージ Select（最小・最大）も `disabled={mode === 'edit'}` で変更不可
- 「範囲指定アラートの条件は編集できません」という Info メッセージが表示される

単一条件と同様に、パーセンテージで作成されたアラートはパーセンテージ変更を許可すべき。

### PUT API が範囲条件（2条件）の更新に未対応

`[id]/route.ts` の PUT 処理は `ConditionList[0]` の単一条件のみマージしており、
範囲指定アラート（2条件）の更新ができない。

### 追加タスク

- [ ] T011: `alerts/page.tsx` の編集モーダルに `basePrice` を渡す
    - `isPercentage=true` の条件がある場合は `value / (1 + percentageValue / 100)` で逆算
    - `isPercentage=false` または情報なしの場合は `basePrice` を渡さない（現状維持）
- [ ] T012: `AlertSettingsModal.tsx` の範囲指定モードでパーセンテージ変更を可能にする
    - 入力方式 Select の `disabled` を `mode === 'edit' && formData.rangeInputMode !== 'percentage'` に変更
    - 最小・最大パーセンテージ Select の `disabled={mode === 'edit'}` を解除
    - 「範囲指定アラートの条件は編集できません」の Info メッセージをパーセンテージ変更が可能になった場合は表示しないように修正
- [ ] T013: `AlertSettingsModal.tsx` の handleSubmit で範囲指定モードの条件更新に対応
    - `formData.conditionMode === 'range'` の場合も `updateData.conditions` をセット
    - パーセンテージモードの場合は各条件に `isPercentage`/`percentageValue` を含める
- [ ] T014: `[id]/route.ts` の PUT 処理で範囲条件（2条件）のマージに対応
    - `existingAlert.ConditionList` の全条件と `body.conditions` をインデックス対応でマージ
- [ ] T015: 上記変更に対するユニットテストを追加
    - `alerts/page.tsx` の basePrice 逆算ロジックのテスト
    - `AlertSettingsModal` 範囲指定パーセンテージ編集のテスト
    - PUT API 範囲条件マージのテスト

## 参考ドキュメント

- `docs/development/rules.md`
- `docs/development/architecture.md`
