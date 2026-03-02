# タスク: Stock Tracker サマリー日足パターン分析

**入力**: `/specs/001-summary-pattern-analysis/` の設計ドキュメント
**前提条件**: plan.md（必須）、spec.md（ユーザーストーリー用、必須）、research.md、data-model.md、contracts/api.md、quickstart.md

**テスト**: ビジネスロジック（`core/src/patterns/`）のユニットテストは必須（MUST）。
E2E テストはサービスの Web UI に必須（MUST）。UI 層のユニットテストは E2E でカバーされる場合は省略可。

**整理方法**: タスクはユーザーストーリー単位でグループ化し、各ストーリーの独立した実装・テストを可能にする。

## フォーマット: `[ID] [P?] [Story] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[Story]**: 対応するユーザーストーリー（例: US1、US2、US3）
- 説明には正確なファイルパスを含めること

---

## フェーズ1: セットアップ（共通基盤）

**目的**: 既存パッケージへの拡張準備（新規ディレクトリ作成、エクスポート整備）

- [ ] T001 `services/stock-tracker/core/src/patterns/` ディレクトリを作成し、`.gitkeep` を配置する

---

## フェーズ2: 基盤構築（必須前提条件）

**目的**: すべてのユーザーストーリー実装前に完了が必要なコア型定義と抽象基底クラス

**⚠️ 重要**: このフェーズが完了するまでユーザーストーリーの実装を開始してはならない

- [ ] T002 `services/stock-tracker/core/src/types.ts` に `PatternStatus`・`PatternSignalType`・`PatternDefinition`・`PatternResults` 型を追加する
- [ ] T003 `services/stock-tracker/core/src/patterns/candlestick-pattern.ts` に抽象基底クラス `CandlestickPattern`（`definition: PatternDefinition`、`analyze(candles: ChartDataPoint[]): PatternStatus`）を実装する

**チェックポイント**: 基盤完了 — ユーザーストーリーの実装を開始可能

---

## フェーズ3: ユーザーストーリー1 — ティッカー一覧で売買シグナル件数を把握する (優先度: P1) 🎯 MVP

**目標**: サマリー一覧の各ティッカー行に買いパターン件数・売りパターン件数を表示し、詳細を開く前に注目銘柄を絞り込めるようにする

**独立したテスト**: 複数ティッカーのサマリーを表示し、各行に買いパターン数・売りパターン数が表示されることを確認する（E2E）

### ユーザーストーリー1のテスト（ビジネスロジックは必須）

> **注意: テストを先に書き、実装前に FAIL することを確認すること**

- [ ] T004 [P] [US1] `services/stock-tracker/core/tests/unit/patterns/morning-star.test.ts` にユニットテストを作成する（MUST: 80% カバレッジ。テストケースは quickstart.md のテスト命名規則に従い、正常系・エッジケース・境界値をすべて網羅する）
- [ ] T005 [P] [US1] `services/stock-tracker/core/tests/unit/patterns/evening-star.test.ts` にユニットテストを作成する（MUST: 80% カバレッジ。MorningStar と対称のテストケースを実装する）
- [ ] T006 [P] [US1] `services/stock-tracker/core/tests/unit/patterns/pattern-analyzer.test.ts` にユニットテストを作成する（TDD スタイルで T012 実装前に作成し FAIL を確認する。正常系: 全パターン実行・BuyPatternCount/SellPatternCount の集計確認。INSUFFICIENT_DATA はカウント外であることを確認する）
- [ ] T007 [P] [US1] `services/stock-tracker/web/tests/unit/app/api/summaries/route.test.ts` にユニットテストを追加する（`buyPatternCount`・`sellPatternCount`・`patternAnalyzed`・`patternDetails` が正しいデフォルト値でレスポンスに含まれることを確認する）
- [ ] T008 [P] [US1] `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に E2E テストを作成する（一覧表示: 各ティッカー行に「買いシグナル」「売りシグナル」カラムが表示されることを確認する）

### ユーザーストーリー1の実装

- [ ] T009 [P] [US1] `services/stock-tracker/core/src/patterns/morning-star.ts` に `MorningStar extends CandlestickPattern` を実装する（definition: `{ patternId: 'morning-star', name: '三川明けの明星', description: '...', signalType: 'BUY' }`、analyze() は data-model.md の判定ロジック仕様に従う）
- [ ] T010 [P] [US1] `services/stock-tracker/core/src/patterns/evening-star.ts` に `EveningStar extends CandlestickPattern` を実装する（definition: `{ patternId: 'evening-star', name: '三川宵の明星', description: '...', signalType: 'SELL' }`、analyze() は data-model.md の判定ロジック仕様に従う）
- [ ] T011 [US1] `services/stock-tracker/core/src/patterns/pattern-registry.ts` に `PATTERN_REGISTRY: readonly CandlestickPattern[]` を定義する（`new MorningStar()`, `new EveningStar()` を含む）
- [ ] T012 [US1] `services/stock-tracker/core/src/patterns/pattern-analyzer.ts` に `PatternAnalyzer` クラスを実装する（`analyze(candles): { patternResults, buyPatternCount, sellPatternCount }` を実装し、MATCHED かつ対応する signalType のみカウントする）
- [ ] T013 [US1] `services/stock-tracker/core/src/entities/daily-summary.entity.ts` に `PatternResults?: PatternResults`・`BuyPatternCount?: number`・`SellPatternCount?: number` フィールドを追加する（後方互換性確保のためオプショナル）
- [ ] T014 [US1] `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts` に新フィールドのマッピングを追加する（`toEntity()` で PatternResults をそのまま保持、`toTickerSummaryResponse()` で PATTERN_REGISTRY に存在するパターンのみ patternDetails に含める）
- [ ] T015 [US1] `services/stock-tracker/core/src/index.ts` に新クラス・型（`CandlestickPattern`・`MorningStar`・`EveningStar`・`PATTERN_REGISTRY`・`PatternAnalyzer`・`PatternStatus`・`PatternSignalType`・`PatternDefinition`・`PatternResults`）のエクスポートを追加する
- [ ] T016 [P] [US1] `services/stock-tracker/web/src/types/stock.ts` に `PatternDetail` インターフェースを追加し、`TickerSummary` に `buyPatternCount`・`sellPatternCount`・`patternAnalyzed`・`patternDetails` フィールドを追加する（contracts/api.md の型定義に準拠）
- [ ] T017 [US1] `services/stock-tracker/web/src/app/api/summaries/route.ts` を変更してパターン情報（`buyPatternCount`・`sellPatternCount`・`patternAnalyzed`・`patternDetails`）をレスポンスに含める（バッチ未実行アイテムはデフォルト値 `{ buyPatternCount: 0, sellPatternCount: 0, patternAnalyzed: false, patternDetails: [] }` を返す）
- [ ] T018 [US1] `services/stock-tracker/web/src/app/summaries/page.tsx` のサマリー一覧テーブルに「買いシグナル」「売りシグナル」カラムを追加する（FR-004: 判定不能件数は一覧画面に表示しない）

**チェックポイント**: ユーザーストーリー1が独立して機能・テスト可能な状態

---

## フェーズ4: ユーザーストーリー2 — 詳細ダイアログでパターン内訳を確認する (優先度: P2)

**目標**: 詳細ダイアログで各パターンの該当有無・ツールチップ説明を表示し、件数だけでは分からない内訳と意味をユーザーが理解できるようにする

**独立したテスト**: 任意のティッカー詳細ダイアログを開き、三川明けの明星・三川宵の明星それぞれの該当有無と説明表示を確認する（E2E）

### ユーザーストーリー2のテスト

- [ ] T019 [P] [US2] `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` に E2E テストを追加する（詳細ダイアログ: 各パターンの該当有無表示・ツールチップでの説明確認・買い/売りエリア分離の確認。INSUFFICIENT_DATA ラベルと理由表示の確認）

### ユーザーストーリー2の実装

- [ ] T020 [US2] `services/stock-tracker/web/src/app/summaries/page.tsx` の詳細ダイアログに「パターン分析」セクションを追加する（FR-005: 買い/売りで表示エリアを分ける。FR-006: MUI `<Tooltip>` でパターン説明を表示する。FR-009: INSUFFICIENT_DATA は「判定不能」ラベル + 理由表示）

**チェックポイント**: ユーザーストーリー1と2が独立して機能する状態

---

## フェーズ5: ユーザーストーリー3 — サマリー更新時にパターン判定結果が反映される (優先度: P3)

**目標**: 日次更新後に各ティッカーのパターン判定結果が最新サマリーに反映され、直近の分析結果を確認できるようにする

**独立したテスト**: サマリー更新処理後のデータを確認し、対象ティッカーすべてにパターン判定結果が存在することを確認する（ユニットテスト）

### ユーザーストーリー3のテスト（ビジネスロジックは必須）

- [ ] T021 [P] [US3] `services/stock-tracker/batch/tests/unit/summary.test.ts` にユニットテストを追加する（`count: 50` で日足取得・PatternAnalyzer 呼び出し・upsert への統合保存を確認する）
- [ ] T021b [P] [US3] `services/stock-tracker/batch/tests/unit/summary.test.ts` に取得失敗ケースのテストを追加する（取得失敗時に前回結果を未更新のまま warn ログ出力することを確認する。FR-011: ログに ticker・実行日時・理由が含まれることを確認する）

### ユーザーストーリー3の実装

- [ ] T022 [US3] `services/stock-tracker/batch/src/summary.ts` を変更して `getChartData(tickerId, 'D', { count: 50 })` の1回呼び出しで OHLC 保存用データとパターン分析用データを兼用する（research.md のバッチ処理方針に従う）
- [ ] T023 [US3] `services/stock-tracker/batch/src/summary.ts` に `PatternAnalyzer` を使ったパターン分析と `DailySummary.upsert()` への統合保存処理を実装する（FR-001: 過去50日分を参照してパターン分析を実行する）
- [ ] T024 [US3] `services/stock-tracker/batch/src/summary.ts` に日足データ取得失敗時の warn ログ出力処理を実装する（FR-011: ticker・実行日時・理由を出力する。失敗ティッカーは前回結果を未更新のままとする）

**チェックポイント**: すべてのユーザーストーリーが独立して機能する状態

---

## フェーズ6: 品質向上・横断的関心事

**目的**: 複数のユーザーストーリーに影響する品質確認

- [ ] T025 [P] lint・format-check の通過確認（`npm run lint --workspace @nagiyu/stock-tracker-core`、`@nagiyu/stock-tracker-batch`、`@nagiyu/stock-tracker-web`）
- [ ] T026 [P] テストカバレッジ 80% 以上の確認（`npm run test:coverage --workspace @nagiyu/stock-tracker-core`、`@nagiyu/stock-tracker-batch`、`@nagiyu/stock-tracker-web`）
- [ ] T027 [P] E2E テストのフル実行確認（chromium-desktop・chromium-mobile・webkit-mobile。`npx playwright test tests/e2e/summary-display.spec.ts`）
- [ ] T028 依存関係順でのビルド確認（`@nagiyu/stock-tracker-core` → `@nagiyu/stock-tracker-batch` → `@nagiyu/stock-tracker-web`）

---

## 依存関係と実行順序

### フェーズ依存関係

- **セットアップ（フェーズ1）**: 依存なし — 即座に開始可能
- **基盤構築（フェーズ2）**: セットアップ完了後 — フェーズ3以降をすべてブロック
- **ユーザーストーリー（フェーズ3以降）**: 基盤構築フェーズ完了後
  - US1 → US2 → US3 の優先度順に逐次実施（US2 は US1 の UI 拡張のため US1 に依存、US3 は core 側 US1 完了後に開始可能）
- **品質向上（フェーズ6）**: すべての対象ユーザーストーリー完了後

### フェーズ内依存関係

- **フェーズ3 — テスト作成（T004〜T008）**: T002・T003 完了後に並列実行可
  - T004・T005・T006: TDD スタイルのため実装前に作成（実装完了まで FAIL のままにする）
  - T007・T008: T016・T017・T018 の実装前に作成
- **フェーズ3 — パターン実装（T009・T010）**: T004・T005 の FAIL 確認後に開始、並列実行可
- **フェーズ3 — レジストリ（T011）**: T009・T010 完了後
- **フェーズ3 — アナライザ（T012）**: T011 完了後
- **フェーズ3 — エンティティ・型定義（T013・T016）**: T002 完了後に並列実行可
- **フェーズ3 — マッパー（T014）**: T013・T011 完了後
- **フェーズ3 — エクスポート（T015）**: T009〜T012 完了後
- **フェーズ3 — API ルート（T017）**: T014〜T016 完了後
- **フェーズ3 — 一覧 UI（T018）**: T017 完了後
- **フェーズ4（T019・T020）**: US1（フェーズ3）完了後に開始可
- **フェーズ5（T021〜T024）**: T002・T012・T015（core エクスポート）完了後に開始可

### 並列実行の機会

- `[P]` タグが付いたタスクは並列実行可能
- フェーズ3内: T004・T005・T006 は並列実行可（異なるテストファイル）
- フェーズ3内: T009・T010 は並列実行可（異なるパターンクラスファイル）
- フェーズ3内: T016・T007 は並列実行可（web 型定義・API テスト）
- フェーズ5と並行してフェーズ4の実装を進めることも可能

---

## 実装戦略

### MVP ファースト（ユーザーストーリー1のみ）

1. フェーズ1: セットアップ（T001）
2. フェーズ2: 基盤構築（T002・T003）
3. フェーズ3: ユーザーストーリー1（T004〜T018）
4. **停止して検証**: 一覧画面の買い/売りカラムを独立してテスト
5. 準備ができればデモ・レビュー

### インクリメンタルデリバリー

1. セットアップ + 基盤構築 → 基盤完成（T001〜T003）
2. ユーザーストーリー1追加 → 独立テスト → デモ（MVP!）（T004〜T018）
3. ユーザーストーリー2追加 → 独立テスト → デモ（T019〜T020）
4. ユーザーストーリー3追加 → 独立テスト → デモ（T021〜T024）
5. 各ストーリーは前のストーリーを壊さずに価値を追加

---

## 注記

- `[P]` タスク = 異なるファイル、依存関係なし
- `[Story]` ラベルはトレーサビリティのためにタスクを特定のユーザーストーリーにマップ
- 各ユーザーストーリーは独立して完了・テスト可能であること
- 実装前にテストが FAIL することを確認すること（TDD）
- 各タスクまたは論理グループ後にコミットすること
- 任意のチェックポイントで停止してストーリーを独立して検証すること
- パターン判定ロジックの詳細仕様は `specs/001-summary-pattern-analysis/data-model.md` を参照すること
- API レスポンス仕様は `specs/001-summary-pattern-analysis/contracts/api.md` を参照すること
- ビルド・テストコマンドは `specs/001-summary-pattern-analysis/quickstart.md` を参照すること
