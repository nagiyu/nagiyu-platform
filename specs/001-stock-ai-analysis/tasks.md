# タスク: Stock Tracker AI 解析機能

**入力**: `/specs/001-stock-ai-analysis/` の設計ドキュメント  
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/

**テスト**: ビジネスロジック（`batch/src/lib/`、`core` パッケージ）のユニットテストは必須（MUST）。  
E2E テストはサービスの Web UI に必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。

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

- [ ] T001 `openai` パッケージをバッチに追加: `npm install openai --workspace=@nagiyu/stock-tracker-batch`

---

## フェーズ2: Web UI 先行実装（仮データ版）- US1 🎯 早期dev検証

**目標**: AI 解析セクションを UI に追加し、サンプルデータでdev環境での早期検証を可能にする。Core・バッチ実装前でも UI の確認・フィードバックが得られる。

**独立したテスト**: サマリー画面の詳細ダイアログを開き、「AI 解析」セクションが表示されること（サンプルテキストまたは「未生成」メッセージ）をブラウザで確認

**⚠️ 注意**: このフェーズで追加するサンプルデータ（`aiAnalysis` 仮値）はフェーズ5で実データに置換する

### Web UI 先行実装のタスク

- [ ] T002 [P] [US1] `services/stock-tracker/web/types/stock.ts` の `TickerSummary` 型に `aiAnalysis?: string` フィールドを追加
- [ ] T003 [P] [US1] `services/stock-tracker/web/lib/error-messages.ts` にAI解析用エラーメッセージ定数を追加（`AI_ANALYSIS_NOT_GENERATED: 'AI 解析はまだ生成されていません'`、`AI_ANALYSIS_FAILED: 'AI 解析の取得に失敗しました'`）
- [ ] T004 [US1] `services/stock-tracker/web/app/api/summaries/route.ts` の `TickerSummaryResponse` インターフェースに `aiAnalysis?: string` を追加し、`toTickerSummaryResponse()` 関数でサンプル値（`'（サンプル）価格は上昇傾向にあります。'`）を返すよう更新（T002 に依存）
- [ ] T005 [US1] `services/stock-tracker/web/app/summaries/page.tsx` のダイアログにパターン分析の後に「AI 解析」セクション（`<Divider />`・`<Typography variant="h6">AI 解析</Typography>`・本文または「未生成」メッセージ）を追加（T002、T003 に依存）
- [ ] T006 [P] [US1] `services/stock-tracker/web/tests/unit/app/api/summaries/route.test.ts` に `aiAnalysis` フィールドがレスポンスに含まれるテストケースを追加
- [ ] T007 [P] [US1] `services/stock-tracker/web/tests/unit/app/summaries-page.test.ts` にAI解析セクション表示テスト（`aiAnalysis` あり/なし両パターン）を追加
- [ ] T008 [US1] `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` にAI解析セクションのE2Eテストを追加（ダイアログ表示・セクション存在確認）

**チェックポイント**: dev環境でサマリー画面を起動し、詳細ダイアログでAI解析セクションが表示されることを確認。フィードバックを収集する。

---

## フェーズ3: Core 基盤整備

**目的**: `DailySummaryEntity` に `AiAnalysis` フィールドを追加し、mapper を更新する。バッチ・Web 本番化の前提条件。

**独立したテスト**: `npm run test --workspace=@nagiyu/stock-tracker-core` が全通過し、`npm run build --workspace=@nagiyu/stock-tracker-core` が成功すること

**⚠️ 重要**: このフェーズ完了後にフェーズ4・5の実装を開始する

- [ ] T009 `services/stock-tracker/core/src/entities/daily-summary.entity.ts` の `DailySummaryEntity` インターフェースに `AiAnalysis?: string` フィールドを追加
- [ ] T010 `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` の `DailySummaryPatternResponse` インターフェースに `aiAnalysis?: string` を追加し、`toItem()`・`toEntity()`・`toTickerSummaryResponse()` に `AiAnalysis` のマッピングを追加（T009 に依存）
- [ ] T011 [P] `services/stock-tracker/core/tests/unit/entities/daily-summary.entity.test.ts` に `AiAnalysis` フィールドのテストケースを追加
- [ ] T012 [P] `services/stock-tracker/core/tests/unit/mappers/daily-summary.mapper.test.ts` に `AiAnalysis` の `toItem`・`toEntity`・`toTickerSummaryResponse` マッピングテストを追加（T010 に依存）

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-core` が全通過する

---

## フェーズ4: Batch AI 処理実装 - US2・US4

**目標**: OpenAI Responses API を呼び出して AI 解析テキストを生成し、サマリーレコードに保存する。API 障害時も既存処理を継続する（フォールトトレランス）。

**独立したテスト**: `npm run test --workspace=@nagiyu/stock-tracker-batch` が全通過し、`npm run build --workspace=@nagiyu/stock-tracker-batch` が成功すること

### ユーザーストーリー2・4のタスク

- [ ] T013 [P] [US2] `services/stock-tracker/batch/src/lib/openai-client.ts` を新規作成: `AiAnalysisInput` 型定義、`generateAiAnalysis(apiKey, input): Promise<string>` 関数（OpenAI Responses API `gpt-5-mini` + `web_search` ツール・指数バックオフ最大3回リトライ）を実装
- [ ] T014 [US2] [US4] `services/stock-tracker/batch/src/summary.ts` を更新: `HandlerDependencies` に `generateAiAnalysisFn?` を追加、`BatchStatistics` に `aiAnalysisGenerated`・`aiAnalysisSkipped` を追加、`processExchange` 内のティッカーループに `upsert()` 成功後の AI 処理ステップ（try/catch 分離・`AiAnalysis` 未設定時のみ生成・再 upsert）を追加（T009・T013 に依存）
- [ ] T015 [P] [US2] `services/stock-tracker/batch/tests/unit/lib/openai-client.test.ts` を新規作成（正常・APIエラー・リトライ・タイムアウトのテストケース）
- [ ] T016 [P] [US4] `services/stock-tracker/batch/tests/unit/summary.test.ts` にAI処理のテストケースを追加（`generateAiAnalysisFn` モック注入・成功時 aiAnalysisGenerated++・失敗時 aiAnalysisSkipped++・APIキー未設定時スキップ）

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-batch` が全通過する。AI 処理のエラーが `stats.errors` に混入しないことを確認。

---

## フェーズ5: Web 本番適用（仮データ撤廃）- US1 本番化

**目標**: フェーズ2の仮データ（サンプル文字列）を実データ（Core mapper 経由の `AiAnalysis`）に置換する。

**独立したテスト**: `npm run test --workspace=@nagiyu/stock-tracker-web` が全通過し、E2E テストが実データパスで通過すること

**⚠️ 前提**: フェーズ3（Core 基盤整備）完了が必須

- [ ] T017 [US1] `services/stock-tracker/web/app/api/summaries/route.ts` の `toTickerSummaryResponse()` から仮データ（`aiAnalysis: 'サンプル...'`）を削除し、`dailySummaryMapper.toTickerSummaryResponse(summary)` のスプレッドで `aiAnalysis` が自動的に含まれる形に変更（T010 に依存）
- [ ] T018 [P] [US1] `services/stock-tracker/web/tests/unit/app/api/summaries/route.test.ts` を更新: 仮データのテストを実データ（`AiAnalysis` あり/なし）のマッピングテストに変更
- [ ] T019 [P] [US1] `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` を更新: 実データパスでのAI解析セクション表示確認

**チェックポイント**: `npm run test --workspace=@nagiyu/stock-tracker-web` が全通過する。仮データが撤廃されていること。

---

## フェーズ6: インフラ整備

**目的**: OpenAI API キーを Secrets Manager に保管し、バッチ Lambda に環境変数として注入する。

- [ ] T020 `infra/stock-tracker/lib/secrets-stack.ts` に OpenAI API キーシークレット（`nagiyu-stock-tracker-openai-api-key-${environment}`）を追加（`SecretsStack` クラスに `openAiApiKeySecret` プロパティを追加。既存 VAPID シークレットと同一パターン）
- [ ] T021 `infra/stock-tracker/lib/lambda-stack.ts` の `LambdaStackProps` に `openAiApiKey: string` を追加し、バッチ Lambda 関数の `environment` に `OPENAI_API_KEY: props.openAiApiKey` を設定（T020 に依存）
- [ ] T022 `.github/workflows/stock-tracker-deploy.yml` の `aws-actions/aws-secretsmanager-get-secrets` ステップに `nagiyu-stock-tracker-openai-api-key-${environment}` を追加し、取得した値を CDK context（`--context openAiApiKey="..."` 経由）でバッチスタックへ渡す（T020・T021 に依存）

**チェックポイント**: CDK デプロイが成功し、バッチ Lambda の環境変数に `OPENAI_API_KEY` が設定されていること。

---

## フェーズ7: 品質向上・横断的関心事

**目的**: 全パッケージの品質確認と最終検証

- [ ] T023 [P] lint・format-check 通過確認（`npm run format:check && npm run lint --workspace=@nagiyu/stock-tracker-core`）
- [ ] T024 [P] lint・format-check 通過確認（`npm run format:check && npm run lint --workspace=@nagiyu/stock-tracker-batch`）
- [ ] T025 [P] lint・format-check 通過確認（`npm run format:check && npm run lint --workspace=@nagiyu/stock-tracker-web`）
- [ ] T026 カバレッジ 80% 以上の確認（`npm run test:coverage --workspace=@nagiyu/stock-tracker-core` / `@nagiyu/stock-tracker-batch` / `@nagiyu/stock-tracker-web`）
- [ ] T027 E2E テストフル実行確認（chromium-desktop、chromium-mobile、webkit-mobile）

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
  ↓
フェーズ7（品質向上）
```

### ユーザーストーリーとフェーズの対応

| ユーザーストーリー | フェーズ | 備考 |
|-------------------|---------|------|
| US1（ダイアログで閲覧）P1 | フェーズ2（仮）+ フェーズ5（本番） | 2段階実装 |
| US2（バッチで自動生成）P1 | フェーズ4 | フェーズ3 完了が前提 |
| US3（更新ボタンでキック）P2 | 追加実装不要 | US2 完了で自動的に動作 |
| US4（障害時継続）P2 | フェーズ4 | T014・T016 に含む |

### 並列実行の機会

- **フェーズ2内**: T002 と T003 は並列実行可能
- **フェーズ2内**: T006、T007、T008 はフェーズ2実装完了後に並列実行可能
- **フェーズ3内**: T011 と T012 は並列実行可能（T009・T010 完了後）
- **フェーズ4内**: T013 と T016 は並列実行可能
- **フェーズ4・5**: フェーズ3完了後は並列で作業可能
- **フェーズ7**: T023、T024、T025 は並列実行可能

---

## 実装戦略

### UIファースト → 基盤整備 → 本番適用

1. **フェーズ1**: openai パッケージを追加（1タスク）
2. **フェーズ2**: Web UI（仮データ）を完成 → **dev環境で早期検証・フィードバック収集**
3. **フェーズ3**: Core 基盤を整備 → 以降のフェーズの土台
4. **フェーズ4・5**: Batch と Web を並行して本番化（仮データを実データに置換）
5. **フェーズ6**: インフラを整備して本番デプロイ可能な状態に
6. **フェーズ7**: 品質確認と最終検証

### チェックポイント

- **フェーズ2完了後**: dev環境でUI確認・フィードバック収集（AIサンプルデータ表示）
- **フェーズ3完了後**: Core ビルド・テスト通過確認
- **フェーズ4・5完了後**: 全パッケージのビルド・テスト通過確認
- **フェーズ6完了後**: CDK デプロイ成功・Lambda 環境変数確認
- **フェーズ7完了後**: E2E テスト全デバイスで通過、カバレッジ 80% 以上

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし（並列実行可能）
- `[Story]` ラベルはタスクをユーザーストーリーに対応付けるためのもの
- **フェーズ2の仮データ**: `aiAnalysis: 'サンプル...'` は開発検証用。フェーズ5で実データに置換する
- **US3 は新規実装不要**: 更新ボタンは既存実装が既にバッチをキックする。フェーズ4 の US2 が完了すれば自動的に AI 解析が実行される
- **エラーメッセージ**: 日本語で `STOCK_TRACKER_ERROR_MESSAGES` オブジェクトへ追加する（`services/stock-tracker/web/lib/error-messages.ts`）
