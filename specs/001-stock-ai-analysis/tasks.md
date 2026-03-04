# タスク: Stock Tracker AI 解析機能

**入力**: `/specs/001-stock-ai-analysis/` の設計ドキュメント  
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/

**テスト**: ビジネスロジック（`batch/src/lib/`、`core` パッケージ）のユニットテストは必須（MUST）。  
E2E テストはサービスの Web UI に必須（MUST）。実装とテストは同一タスクで行う。

**実装方針**: UIを先に整備してdev環境で早期検証（AIはサンプルデータ）→ Core基盤整備 → Webとバッチへの本番適用（仮データ撤廃）

## フォーマット: `[ID] [P?] [Story] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（US1、US2、US3、US4）
- 説明には正確なファイルパスを含めること

## パス規則（Stock Tracker 準拠）

- **core パッケージ**: `services/stock-tracker/core/src/`
- **batch パッケージ**: `services/stock-tracker/batch/src/`
- **web パッケージ**: `services/stock-tracker/web/`（`app/`、`types/`、`lib/`）
- **インフラ**: `infra/stock-tracker/lib/`
- **テスト**: `tests/unit/`、`tests/e2e/`

---

## フェーズ1: セットアップ（共通基盤）

**目的**: 依存パッケージの追加

- [x] T001 `openai` パッケージをバッチに追加: `npm install openai --workspace=@nagiyu/stock-tracker-batch`

---

## フェーズ2: Web UI 先行実装（仮データ版）- US1 🎯 早期dev検証

**目標**: AI 解析セクションを UI に追加し、サンプルデータでdev環境での早期検証を可能にする。Core・バッチ実装前でも UI の確認・フィードバックが得られる。

**独立したテスト**: サマリー画面の詳細ダイアログを開き、「AI 解析」セクションが表示されること（サンプルテキストまたは「未生成」メッセージ）をブラウザで確認

**⚠️ 注意**: このフェーズで追加するサンプルデータ（`aiAnalysis` 仮値）はフェーズ5で実データに置換する

### Web UI 先行実装のタスク

- [x] T002 [P] [US1] `services/stock-tracker/web/types/stock.ts` の `TickerSummary` 型に `aiAnalysis?: string` / `aiAnalysisError?: string` フィールドを追加
- [ ] T003 [P] [US1] `services/stock-tracker/web/lib/error-messages.ts` にAI解析用エラーメッセージ定数を追加（`AI_ANALYSIS_NOT_GENERATED: 'AI 解析はまだ生成されていません'`、`AI_ANALYSIS_FAILED: 'AI 解析の取得に失敗しました'`）
- [ ] T004 [US1] `services/stock-tracker/web/app/api/summaries/route.ts` の `TickerSummaryResponse` インターフェースに `aiAnalysis?: string` / `aiAnalysisError?: string` を追加し `toTickerSummaryResponse()` でサンプル値を返すよう更新 + `tests/unit/app/api/summaries/route.test.ts` に `aiAnalysis` / `aiAnalysisError` フィールドのテストケースを追加（T002 に依存）
- [ ] T005 [US1] `services/stock-tracker/web/app/summaries/page.tsx` のダイアログにパターン分析の後に「AI 解析」セクション（`<Divider />`・`<Typography variant="h6">AI 解析</Typography>`・本文、失敗メッセージ、未生成メッセージの 3 パターン表示）を追加 + `tests/unit/app/summaries-page.test.ts` にAI解析セクション表示テスト（`aiAnalysis` が string / `aiAnalysisError` が string / 両方 undefined の 3 パターン）を追加 + `tests/e2e/summary-display.spec.ts` にAI解析セクションのE2Eテストを追加（T002、T003 に依存）

**チェックポイント**: dev環境でサマリー画面を起動し、詳細ダイアログでAI解析セクションが表示されることを確認。フィードバックを収集する。

---

## フェーズ3: Core 基盤整備

**目的**: `DailySummaryEntity` に `AiAnalysis` / `AiAnalysisError` フィールドを追加し、mapper を更新する。バッチ・Web 本番化の前提条件。

**⚠️ 重要**: このフェーズ完了後にフェーズ4・5の実装を開始する

- [ ] T006 `services/stock-tracker/core/src/entities/daily-summary.entity.ts` の `DailySummaryEntity` インターフェースに `AiAnalysis?: string` / `AiAnalysisError?: string` フィールドを追加 + `tests/unit/entities/daily-summary.entity.test.ts` に `AiAnalysis` / `AiAnalysisError` フィールドのテストケースを追加
- [ ] T007 `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` の `DailySummaryPatternResponse` インターフェースに `aiAnalysis?: string` / `aiAnalysisError?: string` を追加し `toItem()`・`toEntity()`・`toTickerSummaryResponse()` に `AiAnalysis` / `AiAnalysisError` のマッピングを追加 + `tests/unit/mappers/daily-summary.mapper.test.ts` に `AiAnalysis` / `AiAnalysisError` のマッピングテスト（成功・失敗・未生成の 3 パターン）を追加（T006 に依存）

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-core` が全通過する

---

## フェーズ4: Batch AI 処理実装 - US2・US4

**目標**: OpenAI Responses API を呼び出して AI 解析テキストを生成し、サマリーレコードに保存する。API 障害時も既存処理を継続する（フォールトトレランス）。

### ユーザーストーリー2・4のタスク

- [ ] T008 [P] [US2] `services/stock-tracker/batch/src/lib/openai-client.ts` を新規作成: `AiAnalysisInput` 型定義、`generateAiAnalysis(apiKey, input): Promise<string>` 関数（OpenAI Responses API `gpt-5-mini` + `web_search` ツール・指数バックオフ最大3回リトライ）を実装 + `tests/unit/lib/openai-client.test.ts` を新規作成（正常・APIエラー・リトライ・タイムアウトのテストケース）
- [ ] T009 [US2] [US4] `services/stock-tracker/batch/src/summary.ts` を更新: `HandlerDependencies` に `generateAiAnalysisFn?` を追加、`BatchStatistics` に `aiAnalysisGenerated`・`aiAnalysisSkipped` を追加、`processExchange` 内のティッカーループに `upsert()` 成功後の AI 処理ステップ（try/catch 分離・`AiAnalysis` が `undefined` の場合のみ生成・失敗時は `AiAnalysisError` にエラー情報を格納して再 upsert）を追加 + `tests/unit/summary.test.ts` にAI処理のテストケースを追加（`generateAiAnalysisFn` モック注入・成功時 aiAnalysisGenerated++・失敗時 aiAnalysisSkipped++ かつ `AiAnalysisError` upsert・APIキー未設定時スキップ）（T006・T008 に依存）

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-batch` が全通過する。AI 処理のエラーが `stats.errors` に混入しないことを確認。

---

## フェーズ5: Web 本番適用（仮データ撤廃）- US1 本番化

**目標**: フェーズ2の仮データ（サンプル文字列）を実データ（Core mapper 経由の `AiAnalysis`）に置換する。

**⚠️ 前提**: フェーズ3（Core 基盤整備）完了が必須

- [ ] T010 [US1] [US3] `services/stock-tracker/web/app/api/summaries/route.ts` の `toTickerSummaryResponse()` から仮データを削除し `dailySummaryMapper.toTickerSummaryResponse(summary)` のスプレッドで `aiAnalysis` / `aiAnalysisError` が自動的に含まれる形に変更 + `tests/unit/app/api/summaries/route.test.ts` を実データ（`AiAnalysis` が string / `AiAnalysisError` が string / 両方 undefined の 3 パターン）のマッピングテストに更新 + `tests/e2e/summary-display.spec.ts` を実データパスでの表示確認に更新（US3: 更新ボタンを押してバッチをキック後に詳細ダイアログで AI 解析セクションが表示されることを確認するシナリオを追加）（T007 に依存）

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-web` が全通過する。仮データが撤廃されていること。

---

## フェーズ6: インフラ整備

**目的**: OpenAI API キーを Secrets Manager に保管し、バッチ Lambda に環境変数として注入する。

- [ ] T011 `infra/stock-tracker/lib/secrets-stack.ts` に OpenAI API キーシークレット（`nagiyu-stock-tracker-openai-api-key-${environment}`）を追加（`SecretsStack` クラスに `openAiApiKeySecret` プロパティを追加。既存 VAPID シークレットと同一パターン）
- [ ] T012 `infra/stock-tracker/lib/lambda-stack.ts` の `LambdaStackProps` に `openAiApiKey: string` を追加し、バッチ Lambda 関数の `environment` に `OPENAI_API_KEY: props.openAiApiKey` を設定（T011 に依存）
- [ ] T013 `.github/workflows/stock-tracker-deploy.yml` の `aws-actions/aws-secretsmanager-get-secrets` ステップに `nagiyu-stock-tracker-openai-api-key-${environment}` を追加し、取得した値を CDK context（`--context openAiApiKey="..."` 経由）でバッチスタックへ渡す（T011・T012 に依存）

**チェックポイント**: CDK デプロイが成功し、バッチ Lambda の環境変数に `OPENAI_API_KEY` が設定されていること。

---

## 依存関係と実行順序

### フェーズ依存関係

```
フェーズ1（セットアップ）
  ↓
フェーズ2（Web UI 仮データ版）  ← dev環境で早期検証・フィードバック収集
  ↓
フェーズ3（Core 基盤整備）      ← フェーズ4・5の前提条件
  ↓
フェーズ4（Batch AI 処理）  ←┐  並行作業可
フェーズ5（Web 本番適用）   ←┘  並行作業可
  ↓
フェーズ6（インフラ整備）       ← フェーズ4完了後
```

### ユーザーストーリーとフェーズの対応

| ユーザーストーリー | フェーズ | 備考 |
|-------------------|---------|------|
| US1（ダイアログで閲覧）P1 | フェーズ2（仮）+ フェーズ5（本番） | 2段階実装 |
| US2（バッチで自動生成）P1 | フェーズ4 | フェーズ3 完了が前提 |
| US3（更新ボタンでキック）P2 | フェーズ5（E2E テストのみ） | 追加実装不要。US2 完了で自動的に動作。T010 の E2E に受け入れシナリオを追加 |
| US4（障害時継続）P2 | フェーズ4 | T009 に含む |

### 並列実行の機会

- **フェーズ2内**: T002 と T003 は並列実行可能
- **フェーズ4内**: T008 は T009 と並行で開始可能（T009 は T008 完了待ち）
- **フェーズ4・5**: フェーズ3完了後は並列で作業可能

---

## 実装戦略

### UIファースト → 基盤整備 → 本番適用

1. **フェーズ1**: openai パッケージを追加（1タスク）
2. **フェーズ2**: Web UI（仮データ）を完成 → **dev環境で早期検証・フィードバック収集**
3. **フェーズ3**: Core 基盤を整備 → 以降のフェーズの土台
4. **フェーズ4・5**: Batch と Web を並行して本番化（仮データを実データに置換）
5. **フェーズ6**: インフラを整備して本番デプロイ可能な状態に

### チェックポイント

- **フェーズ2完了後**: dev環境でUI確認・フィードバック収集（AIサンプルデータ表示）
- **フェーズ3完了後**: Core テスト通過確認
- **フェーズ4・5完了後**: 全パッケージのテスト通過確認
- **フェーズ6完了後**: CDK デプロイ成功・Lambda 環境変数確認

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし（並列実行可能）
- `[Story]` ラベルはタスクをユーザーストーリーに対応付けるためのもの
- **実装とテストは同一タスク**: 各タスクに実装ファイルとテストファイルの両方を含む
- **フェーズ2の仮データ**: `aiAnalysis: 'サンプル...'` は開発検証用。フェーズ5で実データに置換する
- **US3 は新規実装不要**: 更新ボタンは既存実装が既にバッチをキックする。フェーズ4 の US2 が完了すれば自動的に AI 解析が実行される。受け入れシナリオの検証は T010 の E2E テストに含める
- **エラーメッセージ**: 日本語で `STOCK_TRACKER_ERROR_MESSAGES` オブジェクトへ追加する（`services/stock-tracker/web/lib/error-messages.ts`）
