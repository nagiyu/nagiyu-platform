# タスク: Stock Tracker 日次サマリー表示

**入力**: `/specs/001-stock-daily-summary/` の設計ドキュメント
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/GET-api-summaries.md

**テスト**: ビジネスロジック（`core` パッケージ）のユニットテストは必須（MUST）。
E2E テストはサービスの Web UI に必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。

**整理方法**: タスクはユーザーストーリー単位でグループ化し、各ストーリーの独立した実装・テストを可能にする。

## フォーマット: `[ID] [P?] [Story] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（US1、US2）
- 説明には正確なファイルパスを含めること

## パス規則（Nagiyu Platform 準拠）

- **core パッケージ**: `services/stock-tracker/core/src/entities/`、`src/mappers/`、`src/repositories/`、`src/types.ts`
- **web パッケージ**: `services/stock-tracker/web/app/`、`web/components/`、`web/lib/`
- **batch パッケージ**: `services/stock-tracker/batch/src/`
- **インフラ**: `infra/stock-tracker/lib/`
- **テスト**: `services/stock-tracker/core/tests/unit/`、`services/stock-tracker/batch/tests/unit/`、`services/stock-tracker/web/tests/e2e/`

---

## フェーズ1: セットアップ（共通基盤）

**目的**: 両ユーザーストーリーの共通型・エンティティ・DynamoDB インフラを整備する

- [ ] T001 `DailySummary` 型定義（TickerID・ExchangeID・Date・Open・High・Low・Close・CreatedAt・UpdatedAt フィールド）を `services/stock-tracker/core/src/types.ts` に追加
- [ ] T002 [P] `DynamoDBItem` 型の `Type` に `'DailySummary'` を追加し、`GSI4PK`・`GSI4SK` オプションフィールドを `services/stock-tracker/core/src/types.ts` に追加（T001 と同一ファイルの別箇所編集のため並列実行可能）
- [ ] T003 [P] `DailySummaryEntity`・`CreateDailySummaryInput`・`DailySummaryKey` を `services/stock-tracker/core/src/entities/daily-summary.entity.ts` に作成
- [ ] T004 [P] GSI4 (ExchangeSummaryIndex) を `infra/stock-tracker/lib/dynamodb-stack.ts` に追加（`GSI4PK: ExchangeID`、`GSI4SK: DATE#{Date}#{TickerID}` のキー設計）

**チェックポイント**: 基盤完了 - ユーザーストーリーの実装を並行して開始可能

---

## フェーズ2: 基盤構築（必須前提条件）

**目的**: すべてのユーザーストーリー実装前に完了が必要なコアリポジトリ層を構築する

**⚠️ 重要**: このフェーズが完了するまでユーザーストーリーの実装を開始してはならない

- [ ] T005 `DailySummaryMapper`（DynamoDB アイテム ↔ エンティティ変換）を `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` に作成
- [ ] T006 [P] `DailySummaryRepository` インターフェース（`getByTickerAndDate`・`getByExchange`・`upsert`）を `services/stock-tracker/core/src/repositories/daily-summary.repository.interface.ts` に作成
- [ ] T007 `InMemoryDailySummaryRepository`（テスト・ローカル開発用）を `services/stock-tracker/core/src/repositories/in-memory-daily-summary.repository.ts` に作成（`InMemorySingleTableStore` を共有ストアとして使用）
- [ ] T008 新規エンティティ・マッパー・リポジトリのエクスポートを `services/stock-tracker/core/src/index.ts` に追加

**チェックポイント**: core パッケージのリポジトリ層完成 - web・batch 両方の実装を並行して開始可能

---

## フェーズ3: ユーザーストーリー1 - 日次サマリーの閲覧 (優先度: P1) 🎯 MVP

**目標**: ユーザーがログイン後 `/summaries` ページで取引所ごとの最新 OHLC サマリーを閲覧できる

**独立したテスト**: InMemory リポジトリに事前登録したサマリーデータを使って `/summaries` ページが正常表示されることを Playwright E2E で確認できる

### ユーザーストーリー1のテスト

- [ ] T009 [P] [US1] `DailySummaryMapper` のユニットテストを `services/stock-tracker/core/tests/unit/mappers/daily-summary.mapper.test.ts` に作成（DynamoDB アイテム → エンティティ変換の正常系・異常系を網羅）
- [ ] T010 [P] [US1] `InMemoryDailySummaryRepository` のユニットテストを `services/stock-tracker/core/tests/unit/repositories/in-memory-daily-summary.repository.test.ts` に作成（`getByExchange`・`upsert` の動作検証）
- [ ] T011 [P] [US1] `DynamoDBDailySummaryRepository` のユニットテストを `services/stock-tracker/core/tests/unit/repositories/dynamodb-daily-summary.repository.test.ts` に作成（DynamoDB SDK をモック化して `getByExchange`・`upsert` の Query/PutItem 呼び出しを検証）
- [ ] T012 [P] [US1] サマリー画面の E2E テストを `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に作成（データあり表示・データなし空状態・取引所グループ化の3シナリオを検証。Fast CI は chromium-mobile のみ、Full CI は全デバイスで実行される）

### ユーザーストーリー1の実装

- [ ] T013 [P] [US1] `DynamoDBDailySummaryRepository`（GSI4 Query + PutItem による Upsert 実装）を `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts` に作成
- [ ] T014 [US1] `createDailySummaryRepository()` ファクトリ関数を `services/stock-tracker/web/lib/repository-factory.ts` に追加（`USE_IN_MEMORY_REPOSITORY` 環境変数で実装を切り替え）
- [ ] T015 [US1] `GET /api/summaries` ルートを `services/stock-tracker/web/app/api/summaries/route.ts` に作成（contracts/GET-api-summaries.md の仕様に準拠・`withAuth('stocks:read')` で認証・`?date=` パラメータ対応）
- [ ] T016 [US1] サマリー一覧ページを `services/stock-tracker/web/app/summaries/page.tsx` に作成（取引所ごとグループ化表示・空状態メッセージ対応・Material-UI + Next.js、スマホファースト）
- [ ] T017 [US1] ナビゲーションバーに「サマリー」エントリ（`href: '/summaries'`）を `services/stock-tracker/web/components/ThemeRegistry.tsx` の `navigationItems` に追加（`stocks:read` 権限保持者に表示）

**チェックポイント**: ユーザーストーリー1が独立して機能・テスト可能な状態（InMemory データで `/summaries` が表示される）

---

## フェーズ4: ユーザーストーリー2 - 日次サマリーの自動生成 (優先度: P1)

**目標**: 1時間間隔バッチが取引時間終了済み取引所の全ティッカーのサマリーを自動生成して DynamoDB に保存する

**独立したテスト**: `summary.ts` のハンドラーを InMemory リポジトリを使った Jest テストで実行し、`isTradingHours` を制御して取引時間終了済み取引所のサマリーが保存されることを確認できる

### ユーザーストーリー2のテスト

- [ ] T018 [P] [US2] `summary.ts` バッチのユニットテストを `services/stock-tracker/batch/tests/unit/summary.test.ts` に作成（取引時間終了済み取引所のサマリー生成・スキップ・Upsert・エラー継続の4シナリオを検証）

### ユーザーストーリー2の実装

- [ ] T019 [US2] 日次サマリー生成バッチを `services/stock-tracker/batch/src/summary.ts` に作成（`handler` エクスポート。`isTradingHours` で取引終了取引所を判定し、`TickerRepository.getByExchange()` でティッカー取得・`getChartData('D', {count:1})` で OHLC 取得・`DailySummaryRepository.upsert()` で保存。エラー時はティッカー・取引所レベルでスキップして処理を継続する）
- [ ] T020 [US2] Summary Lambda を `infra/stock-tracker/lib/lambda-stack.ts` に追加（既存 Lambda パターンに準拠）
- [ ] T021 [US2] Summary EventBridge スケジュールルール（`rate(1 hour)`、ルール名 `stock-tracker-batch-summary-{env}`）を `infra/stock-tracker/lib/eventbridge-stack.ts` に追加（既存の `hourly.ts` 用ルールとは独立した別ルールとして追加）

**チェックポイント**: ユーザーストーリー1と2が連携してエンドツーエンドで機能する状態

---

## フェーズ5: 品質向上・横断的関心事

**目的**: コード品質の最終確認と CI 通過の保証

- [ ] T022 [P] core・batch・web パッケージの lint・format-check を通過させる（`npm run lint`、`npm run format:check`）
- [ ] T023 [P] core・batch パッケージのカバレッジが 80% 以上であることを確認する（`npm run test:coverage`）
- [ ] T024 E2E テストのフル実行確認（`summary-display.spec.ts` が chromium-mobile で通過すること）

---

## 依存関係と実行順序

### フェーズ依存関係

- **フェーズ1（セットアップ）**: 依存なし - 即座に開始可能
- **フェーズ2（基盤構築）**: フェーズ1の T001・T002・T003 完了後 - US1・US2 の実装をブロック
- **フェーズ3（US1 閲覧）**: フェーズ2完了後に開始可能
  - T009〜T012（テスト作成）は並列実行可能
  - T013（DynamoDB リポジトリ）は T011 のテストと並列開始可能
  - T014 → T015 → T016 → T017 の順序で実装
- **フェーズ4（US2 自動生成）**: フェーズ2完了後に開始可能（フェーズ3と並行作業可能）
  - T018（テスト）は T019（実装）と並列開始可能
  - T019 → T020 → T021 の順序で実装
- **フェーズ5（品質向上）**: フェーズ3・4の全タスク完了後

### 並列実行の機会

- T002・T003・T004（フェーズ1）は T001 完了後に並列実行可能
- T006（フェーズ2）は T005 と並列実行可能
- フェーズ2完了後、フェーズ3の T009〜T013 とフェーズ4の T018 は並列実行可能
- T022・T023（フェーズ5）は並列実行可能

### ストーリー完了依存関係

```
フェーズ1（T001-T004）
     ↓
フェーズ2（T005-T008）
   ↙         ↘
US1（T009-T017）  US2（T018-T021）   ← 並行作業可能
   ↘         ↙
フェーズ5（T022-T024）
```

---

## 実装戦略

### MVP ファースト（ユーザーストーリー1のみ）

1. フェーズ1: 共通基盤セットアップ（T001-T004）
2. フェーズ2: core リポジトリ層構築（T005-T008）
3. フェーズ3: ユーザーストーリー1を完了（T009-T017）
4. **停止して検証**: `USE_IN_MEMORY_REPOSITORY=true` で `/summaries` ページを動作確認
5. 準備ができればデモ・デプロイ（US2 なしでも US1 は機能する）

### インクリメンタルデリバリー

1. フェーズ1 + フェーズ2 → 基盤完成
2. フェーズ3追加 → US1 独立テスト → デプロイ/デモ（MVP）
3. フェーズ4追加 → US2 バッチ統合 → デプロイ/デモ（完全版）
4. フェーズ5 → 品質向上 → CI グリーン

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし
- `[Story]` ラベルはトレーサビリティのためにタスクを特定のユーザーストーリーにマップ
- 各ユーザーストーリーは独立して完了・テスト可能
- テストは実装前に作成し、FAIL することを確認すること（TDD アプローチ推奨）
- エラーメッセージは日本語で `ERROR_MESSAGES` 定数として定義すること
- 各タスクまたは論理グループ後にコミットすること
