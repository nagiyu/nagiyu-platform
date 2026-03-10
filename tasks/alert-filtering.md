# アラート管理画面へのフィルタリング機能追加

## 概要

StockTracker のアラート管理画面（`/alerts`）にて、取引所（Exchange）とモード（Buy/Sell）によるフィルタリング機能を追加する。

現状ではアラート一覧画面に全件表示のみで、絞り込み機能がない。取引所やモードでの絞り込みにより、ユーザーが必要なアラートを素早く見つけられるようにする。

## 関連情報

- Issue: #（本Issue番号）
- タスクタイプ: サービスタスク（stock-tracker-web）

## 現状分析

### フロントエンド型定義の不整合

- バックエンドの `AlertEntity` には `ExchangeID` フィールドが存在する
- フロントエンドの `AlertResponse`（`web/types/alert.ts`）には `exchangeId` フィールドが**含まれていない**
- アラート一覧ページ（`app/alerts/page.tsx`）では、テーブル表示時に `exchanges` の一覧から取引所名を逆引きしている

    ```
    tickerIdの形式: "NASDAQ:AAPL"（取引所キー:ティッカー形式）
    ```

- アラートマッパー（`core/src/mappers/alert.mapper.ts`）の変換を確認し、`exchangeId` がフロントエンドへ渡されているか確認が必要

### APIのフィルタリング未対応

- `GET /api/alerts` は全件取得のみ（ページネーション対応済み）
- `AlertRepository.getByUserId()` には `exchangeId` や `mode` によるフィルタリングパラメータがない

### UI状態

- アラート一覧ページ（`app/alerts/page.tsx`）にフィルタリングUIは存在しない
- クエリパラメータで `ticker`, `mode` を受け取る処理があるが、リスト表示への適用はされていない

## 要件

### 機能要件

- FR1: アラート一覧画面に「取引所」でフィルタリングする UI（セレクトボックス）を追加する
- FR2: アラート一覧画面に「モード（Buy/Sell）」でフィルタリングする UI（セレクトボックス）を追加する
- FR3: 取引所フィルタおよびモードフィルタを同時に適用できる
- FR4: フィルタをクリア（全件表示に戻す）できる
- FR5: フィルタ適用後もページネーションが正常に動作する（将来的な対応として考慮）

### 非機能要件

- NFR1: フィルタリングはクライアントサイドで実装する（初期実装）
- NFR2: 取引所の選択肢は既存の `GET /api/exchanges` から取得した一覧を使用する
- NFR3: 既存の Material-UI コンポーネントと統一したデザインを維持する
- NFR4: フィルタリングUIはスマートフォン表示でも使いやすいレイアウトにする

## 実装のヒント

### 方針: クライアントサイドフィルタリング

初期実装としては、既に取得済みのアラート一覧データをフロントエンドでフィルタリングする方式を採用する。これにより、バックエンドへの変更を最小限に抑えられる。

ただし、アラート件数が多い場合はAPIレベルのフィルタリングへの移行も将来的に検討する。

### `AlertResponse` への `exchangeId` 追加検討

- `AlertResponse` に `exchangeId` フィールドが含まれていない場合、`tickerId`（`"NASDAQ:AAPL"` 形式）から取引所キーを抽出するか、`exchangeId` をマッパーで追加する方法を選択する
- アラートマッパー（`core/src/mappers/alert.mapper.ts`）の出力を確認し、`exchangeId` の有無を確認する
- `exchangeId` をフロントエンドへ含める場合は `web/types/alert.ts` の型定義も更新する

### フィルタリングUIの配置

- テーブルの上部にフィルタエリアを設ける
- 取引所フィルタ: `FormControl` + `Select`（`exchanges` の一覧を選択肢として表示）
- モードフィルタ: `FormControl` + `Select`（「すべて」「Buy」「Sell」の3択）
- クリアボタン: フィルタをリセットするボタン

### フィルタリングロジック

- `alerts` の状態に加え、`filterExchangeId` と `filterMode` の状態を管理する
- `useMemo` などで `filteredAlerts` を算出し、テーブルに表示する

## タスク

### フェーズ1: 調査・確認

- [ ] T001: `core/src/mappers/alert.mapper.ts` の内容を確認し、`exchangeId` がレスポンスに含まれるかを確認する
- [ ] T002: `AlertResponse` 型に `exchangeId` フィールドを追加する必要があるか判断する
- [ ] T003: アラート一覧画面の取引所表示ロジックを確認する（tickerIdから取引所を特定する方法）

### フェーズ2: 型定義・マッパーの修正

- [ ] T004: 必要に応じて `web/types/alert.ts` の `AlertResponse` に `exchangeId` を追加する
- [ ] T005: 必要に応じて `core/src/mappers/alert.mapper.ts` を修正し、`exchangeId` をレスポンスに含める
- [ ] T006: 修正に伴うユニットテストを更新・追加する

### フェーズ3: フロントエンド実装

- [ ] T007: `app/alerts/page.tsx` にフィルタ状態（`filterExchangeId`, `filterMode`）を追加する
- [ ] T008: フィルタリングUIコンポーネント（取引所セレクト、モードセレクト、クリアボタン）を実装する
- [ ] T009: `filteredAlerts` を計算するロジックを実装する（既存の `alerts` データをフィルタリング）
- [ ] T010: テーブルの表示データを `filteredAlerts` に切り替える

### フェーズ4: テスト・品質確認

- [ ] T011: ユニットテストを追加・更新する（カバレッジ80%以上維持）
- [ ] T012: E2Eテスト（`tests/e2e/alert-management.spec.ts`）にフィルタリング動作確認を追加する
- [ ] T013: スマートフォン表示での動作確認
- [ ] T014: TypeScript strict mode のエラーがないか確認する
- [ ] T015: ESLint / Prettier のチェックをパスするか確認する

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md` - サービス要件
- `docs/services/stock-tracker/architecture.md` - アーキテクチャ方針
- `docs/development/rules.md` - コーディング規約
- `docs/development/testing.md` - テスト戦略

## 備考・未決定事項

- **APIレベルフィルタリング**: 初期実装はクライアントサイドで行うが、アラートが多い場合は `GET /api/alerts` にクエリパラメータ（`?exchangeId=xxx&mode=Buy`）を追加する方向も検討する。その際は `AlertRepository.getByUserId()` の拡張と DynamoDB の FilterExpression 追加が必要になる
- **URLクエリパラメータ同期**: フィルタ状態をURLパラメータに反映させる（ブックマーク・共有可能にする）機能は初期実装では対象外とし、必要に応じて後続Issueで対応する
- **既存クエリパラメータ `mode` との整合性**: `page.tsx` にはすでに URLクエリパラメータ `mode` を受け取る処理があるため、フィルタUI追加時に競合しないよう注意する
