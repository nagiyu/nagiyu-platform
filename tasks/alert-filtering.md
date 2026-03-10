# アラート管理画面へのフィルタリング機能追加

## 概要

StockTracker のアラート管理画面（`/alerts`）にて、取引所（Exchange）とモード（Buy/Sell）によるフィルタリング機能を追加する。

現状ではアラート一覧画面に全件表示のみで、絞り込み機能がない。取引所やモードでの絞り込みにより、ユーザーが必要なアラートを素早く見つけられるようにする。

## 関連情報

- Issue: #（本Issue番号）
- タスクタイプ: サービスタスク（stock-tracker-web）

## 調査結果

### `exchangeId` の扱い（`alert.mapper.ts` / API レスポンス）

- `core/src/mappers/alert.mapper.ts` は **DynamoDB Item ↔ AlertEntity 間の変換のみ**担当する。フロントエンドへのレスポンス変換は行わない
- API レスポンスへの変換は `web/app/api/alerts/route.ts` 内の `mapAlertToResponse()` で実施している
- `mapAlertToResponse()` は現在 `exchangeId` を**レスポンスに含めていない**
- `web/types/alert.ts` の `AlertResponse` 型にも `exchangeId` フィールドは存在しない

### `tickerId` から取引所IDを取得できる

- `AlertResponse.tickerId` は `"NASDAQ:AAPL"` 形式（取引所キー:ティッカー形式）
- `app/alerts/page.tsx` はすでに `alert.tickerId.split(':')[0]` で取引所キーを取得し、`exchanges` 一覧から取引所名を逆引きしている
- フィルタリングに必要な取引所IDは `tickerId` から取得できるため、**`AlertResponse` 型への `exchangeId` 追加は不要**

### フィルタリング実装の現状

- `app/alerts/page.tsx` にフィルタリングUIなし（全件表示のみ）
- `GET /api/alerts` は全件取得のみ（ページネーション対応済み）
- `AlertRepository.getByUserId()` にはフィルタリングパラメータなし
- クエリパラメータ `ticker`, `mode`, `openModal` を受け取る処理は存在するが、リスト表示への適用はなし

### 方針

フィルタリングは**クライアントサイド**で実装する。取得済みのアラートデータを `tickerId.split(':')[0]` と `alert.mode` でフィルタリングすることで、バックエンドへの変更なしに実現できる。

## 要件

### 機能要件

- FR1: アラート一覧画面に「取引所」でフィルタリングする UI（セレクトボックス）を追加する
- FR2: アラート一覧画面に「モード（Buy/Sell）」でフィルタリングする UI（セレクトボックス）を追加する
- FR3: 取引所フィルタおよびモードフィルタを同時に適用できる
- FR4: フィルタをクリア（全件表示に戻す）できる

### 非機能要件

- NFR1: フィルタリングはクライアントサイドで実装する
- NFR2: 取引所の選択肢は既存の `GET /api/exchanges` から取得した一覧を使用する（`page.tsx` で `exchanges` として取得済み）
- NFR3: 既存の Material-UI コンポーネントと統一したデザインを維持する
- NFR4: フィルタリングUIはスマートフォン表示でも使いやすいレイアウトにする

## 実装のヒント

### フィルタリングUIの配置

- テーブルの上部にフィルタエリアを設ける
- 取引所フィルタ: `FormControl` + `Select`（`exchanges` 一覧を選択肢として表示。「すべて」を先頭に追加）
- モードフィルタ: `FormControl` + `Select`（「すべて」「Buy（買い）」「Sell（売り）」の3択）
- クリアボタン: フィルタをリセットするボタン

### フィルタリングロジック

- `alerts` の状態に加え、`filterExchangeId` と `filterMode` の状態を管理する
- `useMemo` などで `filteredAlerts` を算出し、テーブルに表示する
- 取引所の比較は `alert.tickerId.split(':')[0] === filterExchangeId` で行う（既存ロジックと一致）

## タスク

### フェーズ1: フロントエンド実装

- [ ] T001: `app/alerts/page.tsx` にフィルタ状態（`filterExchangeId`, `filterMode`）を追加する
- [ ] T002: フィルタリングUIコンポーネント（取引所セレクト、モードセレクト、クリアボタン）を実装する
- [ ] T003: `filteredAlerts` を計算するロジックを実装する（`alerts` データを `tickerId.split(':')[0]` と `mode` でフィルタリング）
- [ ] T004: テーブルの表示データを `filteredAlerts` に切り替える

### フェーズ2: テスト・品質確認

- [ ] T005: ユニットテストを追加・更新する（カバレッジ80%以上維持）
- [ ] T006: E2Eテスト（`tests/e2e/alert-management.spec.ts`）にフィルタリング動作確認を追加する
- [ ] T007: スマートフォン表示での動作確認
- [ ] T008: TypeScript strict mode のエラーがないか確認する
- [ ] T009: ESLint / Prettier のチェックをパスするか確認する

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md` - サービス要件
- `docs/services/stock-tracker/architecture.md` - アーキテクチャ方針
- `docs/development/rules.md` - コーディング規約
- `docs/development/testing.md` - テスト戦略

## 備考

- **URLクエリパラメータ同期**: フィルタ状態をURLパラメータに反映させる機能は本Issueの対象外とし、必要に応じて後続Issueで対応する
- **既存クエリパラメータ `mode` との整合性**: `page.tsx` にはすでに URLクエリパラメータ `mode` を受け取る処理があるため、フィルタUI追加時に競合しないよう注意する
