# タスク: Stock Tracker サマリー日足パターン分析

**入力**: `/specs/001-summary-pattern-analysis/` の設計ドキュメント
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/api.md、quickstart.md

**テスト**: ビジネスロジック（`core/src/patterns/`）のユニットテストは必須（MUST）。
E2E テストはサービスの Web UI に必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。

**整理方法**: UI 先行（モックデータ）でユーザーに早期確認してもらい、その後ビジネスロジックを実装して繋ぎ込む。

## フォーマット: `[ID] [P?] [Story] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（例: US1、US2、US3）
- 説明には正確なファイルパスを含めること

---

## フェーズ1: 基盤構築（必須前提条件）

**目的**: UI・ビジネスロジック共通の型定義と抽象基底クラス

**⚠️ 重要**: このフェーズが完了するまで UI・ビジネスロジックの実装を開始してはならない

- [ ] T001 `services/stock-tracker/core/src/types.ts` に `PatternStatus`・`PatternSignalType`・`PatternDefinition`・`PatternResults` 型を追加する
- [ ] T002 [P] `services/stock-tracker/core/src/patterns/candlestick-pattern.ts` に抽象基底クラス `CandlestickPattern`（`definition: PatternDefinition`、`analyze(candles: ChartDataPoint[]): PatternStatus`）を実装し、`services/stock-tracker/core/src/patterns/pattern-registry.ts` に空の `PATTERN_REGISTRY: readonly CandlestickPattern[] = []` を作成する。`services/stock-tracker/core/src/index.ts` に `CandlestickPattern`・`PATTERN_REGISTRY`・`PatternStatus`・`PatternSignalType`・`PatternDefinition`・`PatternResults` のエクスポートを追加する
- [ ] T003 [P] `services/stock-tracker/web/types/stock.ts` に `PatternDetail` インターフェースを追加し、`TickerSummary` に `buyPatternCount`・`sellPatternCount`・`patternAnalyzed`・`patternDetails` フィールドを追加する（contracts/api.md の型定義に準拠）

**チェックポイント**: 基盤完了 — UI 実装を開始可能

---

## フェーズ2: UI 実装（モックデータ）🎯 UI 確認ファースト

**目的**: モックデータを用いて UI の見た目を先行実装し、早期にユーザー確認を可能にする

### ユーザーストーリー1 UI — ティッカー一覧で売買シグナル件数を把握する (優先度: P1)

**独立したテスト**: 複数ティッカーのサマリーを表示し、各行に買いパターン数・売りパターン数が表示されることを確認する（E2E）

- [ ] T004 [US1] `services/stock-tracker/web/app/summaries/page.tsx` のサマリー一覧テーブルに「買いシグナル」「売りシグナル」カラムを追加し、`services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に E2E テストを作成する（FR-004: 判定不能件数は一覧画面に表示しない。モックデータとして `buyPatternCount: 0`・`sellPatternCount: 0` を使用する）
- [ ] T005 `services/stock-tracker/web/package.json` の version を 0.1.0 だけ上げる（例: `0.1.0` → `0.2.0`）

**チェックポイント**: 一覧画面の買い/売りカラムをモックデータで確認可能

### ユーザーストーリー2 UI — 詳細ダイアログでパターン内訳を確認する (優先度: P2)

**独立したテスト**: 任意のティッカー詳細ダイアログを開き、三川明けの明星・三川宵の明星それぞれの該当有無と説明表示を確認する（E2E）

- [ ] T006 [US2] `services/stock-tracker/web/app/summaries/page.tsx` の詳細ダイアログに「パターン分析」セクションを追加し、`services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に E2E テストを追加する（FR-005: 買い/売りで表示エリアを分ける。FR-006: MUI `<Tooltip>` でパターン説明を表示する。FR-009: INSUFFICIENT_DATA は「判定不能」ラベル + 理由表示。モックデータとして固定の `patternDetails` 配列を使用する）

**チェックポイント**: 詳細ダイアログのパターン分析セクションをモックデータで確認可能

---

## フェーズ3: ビジネスロジック実装 — パターン判定ロジック (US1)

**目的**: パターン判定の純粋ロジックを実装し、API 経由で UI に繋ぎ込む

**⚠️ 重要**: 各タスクは実装とユニットテストを同時に完了させること（テストのみの中間コミットは不要）

- [ ] T007 [P] [US1] `services/stock-tracker/core/src/patterns/morning-star.ts` に `MorningStar extends CandlestickPattern` を実装し、`services/stock-tracker/core/tests/unit/patterns/morning-star.test.ts` にユニットテストを作成する。`pattern-registry.ts` の `PATTERN_REGISTRY` に `new MorningStar()` を追加し、`services/stock-tracker/core/src/index.ts` に `MorningStar` のエクスポートを追加する（definition: `{ patternId: 'morning-star', name: '三川明けの明星', description: '...', signalType: 'BUY' }`。analyze() は data-model.md の判定ロジック仕様に従う。テストは quickstart.md の命名規則に従い正常系・エッジケース・境界値を網羅する）
- [ ] T008 [P] [US1] `services/stock-tracker/core/src/patterns/evening-star.ts` に `EveningStar extends CandlestickPattern` を実装し、`services/stock-tracker/core/tests/unit/patterns/evening-star.test.ts` にユニットテストを作成する。`pattern-registry.ts` の `PATTERN_REGISTRY` に `new EveningStar()` を追加し、`services/stock-tracker/core/src/index.ts` に `EveningStar` のエクスポートを追加する（definition: `{ patternId: 'evening-star', name: '三川宵の明星', description: '...', signalType: 'SELL' }`。MorningStar と対称のテストケースを実装する）
- [ ] T009 [US1] `services/stock-tracker/core/src/patterns/pattern-analyzer.ts` に `PatternAnalyzer` クラスを実装し、`services/stock-tracker/core/tests/unit/patterns/pattern-analyzer.test.ts` にユニットテストを作成する。`services/stock-tracker/core/src/index.ts` に `PatternAnalyzer` のエクスポートを追加する（`analyze(candles): { patternResults, buyPatternCount, sellPatternCount }` を実装し MATCHED かつ対応する signalType のみカウントする。INSUFFICIENT_DATA はカウント外であることを確認する）
- [ ] T010 [US1] `services/stock-tracker/core/src/entities/daily-summary.entity.ts` に `PatternResults?: PatternResults`・`BuyPatternCount?: number`・`SellPatternCount?: number` フィールドを追加する（後方互換性確保のためオプショナル）
- [ ] T011 [US1] `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` に新フィールドのマッピングを追加し、既存ユニットテストを更新する（`toEntity()` で PatternResults をそのまま保持、`toTickerSummaryResponse()` で PATTERN_REGISTRY に存在するパターンのみ patternDetails に含める）
- [ ] T012 [US1] `services/stock-tracker/web/app/api/summaries/route.ts` を変更してパターン情報（`buyPatternCount`・`sellPatternCount`・`patternAnalyzed`・`patternDetails`）をレスポンスに含め、`services/stock-tracker/web/tests/unit/app/api/summaries/route.test.ts` にユニットテストを追加する（バッチ未実行アイテムはデフォルト値 `{ buyPatternCount: 0, sellPatternCount: 0, patternAnalyzed: false, patternDetails: [] }` を返す）

**チェックポイント**: ビジネスロジック実装完了 — モックデータから実データに切り替え可能な状態

---

## フェーズ4: ユーザーストーリー3 — サマリー更新時にパターン判定結果が反映される (優先度: P3)

**目標**: 日次更新後に各ティッカーのパターン判定結果が最新サマリーに反映され、直近の分析結果を確認できるようにする

**独立したテスト**: サマリー更新処理後のデータを確認し、対象ティッカーすべてにパターン判定結果が存在することを確認する（ユニットテスト）

- [ ] T013 [US3] `services/stock-tracker/batch/src/summary.ts` を変更して `getChartData(tickerId, 'D', { count: 50 })` の1回呼び出しで OHLC 保存用データとパターン分析用データを兼用し、API 取得直後に取得件数が50本未満の場合は全パターンを INSUFFICIENT_DATA として保存する（FR-012: 50本未満は PatternAnalyzer を呼ばずに判定不能を直接保存する）。50本以上の場合は `PatternAnalyzer` によるパターン分析を実行し `DailySummary.upsert()` へ統合保存する。取得失敗時は前回結果を未更新のまま warn ログを出力する（FR-011: 回数制限なし・次回実行時に再取得）。`services/stock-tracker/batch/tests/unit/summary.test.ts` にユニットテストを追加する（正常系: count:50 での日足取得・PatternAnalyzer 呼び出し・upsert 保存確認。50本未満ケース: PatternAnalyzer を呼ばず全パターン INSUFFICIENT_DATA として upsert されることを確認。失敗ケース: 取得失敗時の warn ログ出力・前回結果を未更新のままとすることを確認。FR-011: ログに ticker・実行日時・理由が含まれることを確認する）

**チェックポイント**: すべてのユーザーストーリーが独立して機能する状態

---

## フェーズ5: ドキュメント統合（specs → docs 移管）

**目的**: 実装完了後に設計ドキュメントを `specs/` から `docs/` に移管し、`specs/001-summary-pattern-analysis/` を削除する

- [ ] T014 `specs/001-summary-pattern-analysis/` 配下のドキュメント（spec.md・plan.md・data-model.md・research.md・quickstart.md・contracts/・checklists/）を `docs/` 配下の適切なパスに移管し、`specs/001-summary-pattern-analysis/` ディレクトリを削除する（移管先パスは `docs/` の既存構成に従う）

---

## フェーズ6: develop PR 前の最終確認

**目的**: develop への PR 時にのみ実施するカバレッジ確認（Full CI で自動検出）

- [ ] T015 テストカバレッジ 80% 以上の確認（`npm run test:coverage --workspace @nagiyu/stock-tracker-core`・`@nagiyu/stock-tracker-batch`・`@nagiyu/stock-tracker-web`）

---

## 依存関係と実行順序

### フェーズ依存関係

- **基盤構築（フェーズ1）**: 依存なし — 即座に開始可能
- **UI 実装（フェーズ2）**: フェーズ1完了後 — モックデータで UI を先行確認
- **ビジネスロジック（フェーズ3）**: フェーズ1完了後（フェーズ2と並行可）
- **バッチ（フェーズ4）**: フェーズ3（T009 PatternAnalyzer・core エクスポート）完了後
- **ドキュメント統合（フェーズ5）**: 全機能完了後
- **最終確認（フェーズ6）**: develop PR 前

### フェーズ内依存関係

- **フェーズ1**: T001 完了後に T002・T003 を並列実行可
- **フェーズ2**: T004 完了後に T005 を実施（独立して並列可）。T006 は T004 完了後
- **フェーズ3**: T007・T008 は並列実行可。T009 は T007・T008 完了後。T010 は T001 完了後（独立）。T011 は T010・T007・T008 完了後。T012 は T003・T009 完了後

### 並列実行の機会

- `[P]` タグが付いたタスクは並列実行可能
- フェーズ1内: T002・T003 は並列実行可（異なるファイル）
- フェーズ3内: T007・T008 は並列実行可（異なるパターンクラスファイル）
- フェーズ2と3は独立しており並行作業可能（モデルとビュー分担）

---

## 実装戦略

### UI ファースト

1. フェーズ1: 基盤構築（T001〜T003）
2. フェーズ2: UI をモックデータで実装（T004〜T006）
3. **停止して UI 確認**: 買い/売りカラム・詳細ダイアログをデモ・レビュー
4. フェーズ3: ビジネスロジックを実装して UI に繋ぎ込み（T007〜T012）
5. フェーズ4: バッチに反映（T013）

### インクリメンタルデリバリー

1. 基盤構築 → UI（モック）→ UI デモ
2. ビジネスロジック追加 → 実データで動作 → デモ（MVP!）
3. バッチ追加 → 日次自動更新 → デモ
4. ドキュメント統合 → クリーンアップ

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし
- `[Story]` ラベルはトレーサビリティのためにタスクを特定のユーザーストーリーにマップ
- 各タスクは実装とユニットテストを同時に完了させること（CI 失敗を防ぐため）
- lint・format-check・E2E テストは各 PR の CI で自動検知されるため、個別タスクとして設けない
- 各タスクまたは論理グループ後にコミットすること
- パターン判定ロジックの詳細仕様は `specs/001-summary-pattern-analysis/data-model.md` を参照すること
- API レスポンス仕様は `specs/001-summary-pattern-analysis/contracts/api.md` を参照すること
- ビルド・テストコマンドは `specs/001-summary-pattern-analysis/quickstart.md` を参照すること
