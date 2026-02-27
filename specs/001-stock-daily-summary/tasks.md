# タスク: Stock Tracker 日次サマリー表示

**入力**: `/specs/001-stock-daily-summary/` の設計ドキュメント
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/GET-api-summaries.md

**テスト**: ビジネスロジック（`core` パッケージ）のユニットテストは必須（MUST）。
E2E テストはサービスの Web UI に必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。
**テストは実装と同一タスクで作成すること**（テストのみの先行タスクは設けない）。

**整理方法**: UI 先行構築（仮データ）→ Core リポジトリ層 → Web API 接続 → バッチ の順で実施する。

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

## フェーズ1: セットアップ（共通型・エンティティ）

**目的**: UI 先行構築に必要な型定義とエンティティを整備する

- [ ] T001 `DailySummary` 型定義（TickerID・ExchangeID・Date・Open・High・Low・Close・CreatedAt・UpdatedAt）と `DynamoDBItem` への `'DailySummary'` Type・`GSI4PK`・`GSI4SK` フィールドを `services/stock-tracker/core/src/types.ts` に追加
- [ ] T002 [P] `DailySummaryEntity`・`CreateDailySummaryInput`・`DailySummaryKey` を `services/stock-tracker/core/src/entities/daily-summary.entity.ts` に作成し、エクスポートを `services/stock-tracker/core/src/index.ts` に追加
- [ ] T003 [P] GSI4 (ExchangeSummaryIndex) を `infra/stock-tracker/lib/dynamodb-stack.ts` に追加（`GSI4PK: ExchangeID`、`GSI4SK: DATE#{Date}#{TickerID}` のキー設計）

**チェックポイント**: 型定義完了 - UI 先行構築を開始可能

---

## フェーズ2: UI 先行構築（仮データ）🎯 UIレビュー

**目的**: 仮データでサマリー画面を先行構築し、UI の議論を実環境で行えるようにする

**⚠️ 重要**: リポジトリ実装より先に UI を完成させること。仮データは後工程で実 API に差し替える

- [x] T004 [US1] サマリー一覧ページを仮データで `services/stock-tracker/web/app/summaries/page.tsx` に作成（取引所ごとグループ化表示・空状態メッセージ対応・Material-UI + Next.js、スマホファースト。データは `fetch('/api/summaries')` の代わりにハードコードした仮データを使用し、実 API 差し替えを前提とした設計にする）
- [ ] T005 [P] [US1] ナビゲーションバーに「サマリー」エントリ（`href: '/summaries'`）を `services/stock-tracker/web/components/ThemeRegistry.tsx` の `navigationItems` に追加（`stocks:read` 権限保持者に表示）
- [ ] T006 [P] [US1] サマリー画面の E2E スモークテストを `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に作成（仮データでページが表示されること・ナビゲーションリンクから遷移できることを確認。Fast CI は chromium-mobile のみ、Full CI は全デバイスで実行される。データあり/なし・取引所グループ化の詳細シナリオはインメモリリポジトリ完成後に T011 で追加する）

**チェックポイント**: `/summaries` ページが仮データで閲覧可能な状態 → UIレビューを実施してからフェーズ3へ

---

## フェーズ3: Core リポジトリ層（US1 バックエンド基盤）

**目的**: Web API が利用する DailySummary リポジトリ層を構築する

**⚠️ 重要**: 各タスクはユニットテストと同時に実装すること

- [ ] T007 `DailySummaryMapper`（DynamoDB アイテム ↔ エンティティ変換）と対応するユニットテストを `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` と `services/stock-tracker/core/tests/unit/mappers/daily-summary.mapper.test.ts` に同時作成し、エクスポートを `services/stock-tracker/core/src/index.ts` に追加（DynamoDB アイテム → エンティティ変換の正常系・異常系を網羅）
- [ ] T008 [P] `DailySummaryRepository` インターフェース（`getByTickerAndDate`・`getByExchange`・`upsert`）を `services/stock-tracker/core/src/repositories/daily-summary.repository.interface.ts` に作成し、エクスポートを `services/stock-tracker/core/src/index.ts` に追加
- [ ] T009 `InMemoryDailySummaryRepository`（テスト・ローカル開発用）と対応するユニットテストを `services/stock-tracker/core/src/repositories/in-memory-daily-summary.repository.ts` と `services/stock-tracker/core/tests/unit/repositories/in-memory-daily-summary.repository.test.ts` に同時作成し、エクスポートを `services/stock-tracker/core/src/index.ts` に追加（`getByExchange`・`upsert` の動作を検証）
- [ ] T010 `DynamoDBDailySummaryRepository`（GSI4 Query + PutItem による Upsert 実装）と対応するユニットテストを `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts` と `services/stock-tracker/core/tests/unit/repositories/dynamodb-daily-summary.repository.test.ts` に同時作成し、エクスポートを `services/stock-tracker/core/src/index.ts` に追加（DynamoDB SDK をモック化して Query/PutItem 呼び出しを検証）
- [ ] T011 [US1] `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` にデータあり表示・データなし空状態・取引所グループ化の3シナリオを追加（InMemory リポジトリを利用して事前データを投入し、T006 で作成したスモークテストを拡張する）

**チェックポイント**: core パッケージのリポジトリ層完成 - Web API 接続を開始可能

---

## フェーズ4: Web API・実データ接続（US1 完成）

**目的**: フェーズ2の仮データ画面を実 API に接続し、US1 を完成させる

- [ ] T012 [US1] `createDailySummaryRepository()` ファクトリ関数を `services/stock-tracker/web/lib/repository-factory.ts` に追加（`USE_IN_MEMORY_REPOSITORY` 環境変数で DynamoDB/InMemory 実装を切り替え）
- [ ] T013 [US1] `GET /api/summaries` ルートを `services/stock-tracker/web/app/api/summaries/route.ts` に作成（contracts/GET-api-summaries.md の仕様に準拠・`withAuth('stocks:read')` で認証・`?date=` パラメータ対応）
- [ ] T014 [US1] `services/stock-tracker/web/app/summaries/page.tsx` の仮データを実 API（`GET /api/summaries`）に差し替える

**チェックポイント**: ユーザーストーリー1が独立して機能・テスト可能な状態（InMemory データで `/summaries` が実表示される）

---

## フェーズ5: バッチ（US2 - 日次サマリーの自動生成）

**目的**: 1時間間隔バッチで取引時間終了済み取引所のサマリーを自動生成する

**独立したテスト**: InMemory リポジトリを使った Jest テストで `summary.ts` ハンドラーを実行し、取引時間終了済み取引所のサマリーが保存されることを確認できる

- [ ] T015 [US2] 日次サマリー生成バッチと対応するユニットテストを `services/stock-tracker/batch/src/summary.ts` と `services/stock-tracker/batch/tests/unit/summary.test.ts` に同時作成（`handler` エクスポート。`isTradingHours` で取引終了取引所を判定し、`TickerRepository.getByExchange()` でティッカー取得・`getChartData(tickerId, 'D', { count: 1, session: 'extended' })` で OHLC 取得・`DailySummaryRepository.upsert()` で保存。エラー時はティッカー・取引所レベルでスキップして処理継続。テストは取引時間終了済み取引所のサマリー生成・スキップ・Upsert・エラー継続の4シナリオを検証）
- [ ] T016 [US2] Summary Lambda を `infra/stock-tracker/lib/lambda-stack.ts` に追加（既存 Lambda パターンに準拠）
- [ ] T017 [US2] Summary EventBridge スケジュールルール（`rate(1 hour)`、ルール名 `stock-tracker-batch-summary-{env}`）を `infra/stock-tracker/lib/eventbridge-stack.ts` に追加（既存の `hourly.ts` 用ルールとは独立した別ルールとして追加）

**チェックポイント**: ユーザーストーリー1と2が連携してエンドツーエンドで機能する状態

---

## フェーズ6: 品質向上・横断的関心事

**目的**: コード品質の最終確認と CI 通過の保証

- [ ] T018 [P] core・batch・web パッケージの lint・format-check を通過させる（`npm run lint`、`npm run format:check`）
- [ ] T019 [P] core・batch パッケージのカバレッジが 80% 以上であることを確認する（`npm run test:coverage`）
- [ ] T020 E2E テストのフル実行確認（`summary-display.spec.ts` が chromium-mobile で通過すること）

---

## 依存関係と実行順序

### フェーズ依存関係

- **フェーズ1（セットアップ）**: 依存なし - 即座に開始可能
- **フェーズ2（UI 先行構築）**: フェーズ1の T001・T002 完了後
  - T005・T006 は T004 と並列実行可能
- **フェーズ3（Core リポジトリ層）**: フェーズ1完了後に開始可能（フェーズ2と並行作業可能）
  - T008 は T007 と並列実行可能
  - T009 → T010 の順序で実装
  - T011（E2E テスト拡張）は T009 完了後に実施可能
- **フェーズ4（Web API 接続）**: フェーズ2・フェーズ3の両方が完了後
  - T012 → T013 → T014 の順序で実装
- **フェーズ5（バッチ）**: フェーズ3完了後に開始可能（フェーズ4と並行作業可能）
  - T015 → T016 → T017 の順序で実装
- **フェーズ6（品質向上）**: フェーズ4・5の全タスク完了後

### 並列実行の機会

- T002・T003（フェーズ1）は T001 完了後に並列実行可能
- T005・T006（フェーズ2）は T004 完了後に並列実行可能
- フェーズ3（T007〜T011）とフェーズ2（T004〜T006）は並行作業可能（T011 は T009 完了後）
- フェーズ5（T015〜T017）とフェーズ4（T012〜T014）は並行作業可能
- T018・T019（フェーズ6）は並列実行可能

### 完了依存関係

```
フェーズ1（T001-T003）
   ↙         ↘
フェーズ2（T004-T006）  フェーズ3（T007-T011）   ← 並行作業可能
   ↘         ↙
フェーズ4（T012-T014）
      ↓          ↘
フェーズ5（T015-T017）  （フェーズ3完了後に並行作業可能）
   ↘         ↙
フェーズ6（T018-T020）
```

---

## 実装戦略

### UI ファースト（本機能の推奨アプローチ）

1. フェーズ1: 型定義セットアップ（T001-T003）
2. フェーズ2: 仮データで UI を先行構築（T004-T006）
3. **停止して UI レビュー**: `/summaries` ページを実環境で確認・調整
4. フェーズ3: Core リポジトリ層を構築（T007-T011）
5. フェーズ4: 仮データを実 API に差し替えて US1 完成（T012-T014）
6. フェーズ5: バッチで US2 を完成（T015-T017）
7. フェーズ6: 品質向上 → CI グリーン

### MVP スコープ（US1 のみ）

フェーズ1〜4（T001〜T014）を完了することで US1（サマリー閲覧）を独立デリバリー可能。
US2（バッチ）はフェーズ5で独立して追加できる。

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし
- `[Story]` ラベルはトレーサビリティのためにタスクを特定のユーザーストーリーにマップ
- **テストは実装と同一タスクで作成する**（先行・後続のテスト専用タスクは設けない）
- エラーメッセージは日本語で `ERROR_MESSAGES` 定数として定義すること
- 各タスクまたは論理グループ後にコミットすること
