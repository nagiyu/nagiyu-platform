# 実装計画: Stock Tracker AI 解析機能

**ブランチ**: `001-stock-ai-analysis` | **日付**: 2026-03-03 | **仕様**: `specs/001-stock-ai-analysis/spec.md`  
**入力**: `/specs/001-stock-ai-analysis/spec.md` の機能仕様書

---

## 概要

既存の Stock Tracker バッチ処理（日次サマリー生成）に OpenAI を用いた AI 解析ステップを追加する。バッチが OHLC データとパターン分析結果を取得した後、OpenAI Responses API（`web_search` ツール付き）を呼び出して日本語の解析テキストを生成し、`DailySummary` レコードに保存する。Web フロントエンドのサマリー詳細ダイアログに「AI 解析」セクションを追加して表示する。

**技術的アプローチ**:
- `DailySummaryEntity` に `AiAnalysis?: string | null` フィールドを追加（`null` = 生成失敗、後方互換）
- バッチに `openai-client.ts` を新規追加
- AI 処理は既存処理と完全分離した try/catch で囲み、失敗しても既存機能に影響しない
- Web API レスポンスと UI 型に `aiAnalysis` フィールドを追加し、ダイアログに表示

---

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.x / Node.js 22+  
**主要な依存関係**:
- 既存: Next.js (App Router), React, Material-UI, DynamoDB (Single Table), `@nagiyu/stock-tracker-core`, `@nagiyu/aws`, `@nagiyu/common`, `@nagiyu/nextjs`
- 新規追加: `openai` ^6.x

**ストレージ**: AWS DynamoDB（既存テーブルに `AiAnalysis` フィールドを追加）  
**テスト**: Jest（ユニット）、Playwright（E2E）  
**ターゲットプラットフォーム**: AWS Lambda（バッチ）、Next.js on ECS/Fargate（Web）  
**プロジェクト種別**: core + web + batch（既存構成を拡張）  
**パフォーマンス目標**:
- バッチ全体の既存タイムアウト以内に AI 解析を完了（SC-001）
- Web ダイアログは追加ネットワークリクエストなしで即時表示（SC-003）

**制約**:
- AI エンジンは OpenAI 限定
- API キーは AWS Secrets Manager に保管し、CDK デプロイ時に Lambda 環境変数（`OPENAI_API_KEY`）として注入する（ランタイムでの Secrets Manager 呼び出し不要・既存 VAPID キーと同一パターン）
- AI 解析はバッチ処理時のみ生成（リアルタイム生成なし）

**スコープ**: ウォッチリスト登録済みの全銘柄（最大数十銘柄程度を想定）

---

## 憲法チェック

*フェーズ0の調査前チェック: ✅ 通過*  
*フェーズ1の設計後チェック: ✅ 通過*

- [x] **TypeScript 型安全性 (I)**: strict mode 維持、`AiAnalysis` の型定義は `core/src/entities/` に集約。`AiAnalysis?: string | null` として生成失敗（`null`）を明示的に記録する型安全な設計。`null` = 生成失敗（唯一の特殊状態）、フィールド不在（`undefined`）= 未生成のデフォルト。アクセス修飾子はクラスメンバーに明示。
- [x] **アーキテクチャ・レイヤー分離 (II)**: `AiAnalysisInput` 型・`generateAiAnalysis` 関数は `batch/src/lib/` に配置（core は汚染しない）。`DailySummaryEntity` への追加は core の責務として正当。`batch → core` の一方向依存を維持。`web → core` の一方向依存も維持。
- [x] **コード品質・Lint・フォーマット (III)**: 既存の ESLint・Prettier 設定を継承。エラーメッセージは `ERROR_MESSAGES` 定数オブジェクトで管理。日本語エラーメッセージ。
- [x] **テスト戦略 (IV)**: `openai-client.ts` のユニットテストを `batch/tests/unit/lib/` に追加。OpenAI のモックを使用。`summary.ts` のテストを更新し `generateAiAnalysisFn` をモック注入。カバレッジ 80% 以上を維持。
- [x] **ブランチ戦略・CI/CD (V)**: 既存の `verify-fast.yml` / `verify-full.yml` に追加変更なし（新規パッケージ不要のため）。
- [x] **共通ライブラリ設計 (VI)**: `batch/src/lib/openai-client.ts` はバッチ専用に配置（`@nagiyu/aws` への追加は不要、今回の scope 外）。`batch → @nagiyu/common` 依存のみ（UI・browser 依存なし）。
- [x] **ドキュメント駆動開発 (VII)**: spec.md・plan.md・research.md・data-model.md・quickstart.md・contracts/ を日本語で作成。

---

## プロジェクト構成

### ドキュメント（本機能）

```text
specs/001-stock-ai-analysis/
├── spec.md              # 機能仕様書（既存）
├── plan.md              # 本ファイル
├── research.md          # フェーズ0の出力
├── data-model.md        # フェーズ1の出力
├── quickstart.md        # フェーズ1の出力
├── contracts/
│   ├── api-summaries.md         # GET /api/summaries 変更仕様
│   └── batch-ai-interface.md    # バッチ AI インターフェース仕様
└── tasks.md             # フェーズ2の出力 (/speckit.tasks コマンドで作成)
```

### ソースコード（変更対象）

```text
services/stock-tracker/
├── core/
│   └── src/
│       ├── entities/
│       │   └── daily-summary.entity.ts    ★ AiAnalysis フィールド追加
│       └── mappers/
│           └── daily-summary.mapper.ts    ★ AiAnalysis マッピング追加
├── batch/
│   ├── src/
│   │   ├── lib/
│   │   │   └── openai-client.ts           ★ 新規作成
│   │   └── summary.ts                     ★ AI 処理ステップ追加
│   └── package.json                       ★ openai 依存追加
└── web/
    ├── app/
    │   └── api/
    │       └── summaries/
    │           └── route.ts               ★ aiAnalysis フィールド追加
    ├── app/
    │   └── summaries/
    │       └── page.tsx                   ★ AI 解析セクション追加
    └── types/
        └── stock.ts                       ★ aiAnalysis フィールド追加
```

**構成の決定**: 既存の `core + web + batch` 三層構成を拡張。新規パッケージ不要。

---

## 実装フェーズ

### フェーズ A: Core パッケージの拡張（基盤）

**目的**: `DailySummaryEntity` に `AiAnalysis` フィールドを追加し、mapper・repository を更新する。

**変更ファイル**:
1. `core/src/entities/daily-summary.entity.ts` — `AiAnalysis?: string | null` 追加（`null` = 生成失敗）
2. `core/src/mappers/daily-summary.mapper.ts` — `toItem` / `toEntity` / `toTickerSummaryResponse` 更新
3. `core/tests/unit/entities/daily-summary.entity.test.ts` — `AiAnalysis` のテストケース追加
4. `core/tests/unit/mappers/daily-summary.mapper.test.ts` — `AiAnalysis` のマッピングテスト追加

**完了条件**: `core` のユニットテストが全て通過し、`npm run build` が成功する。

---

### フェーズ B: Batch パッケージの拡張（AI 処理）

**目的**: Secrets Manager から API キーを取得し、OpenAI で AI 解析を生成するモジュールを実装する。

**変更ファイル**:
1. `batch/package.json` — `openai` 依存追加
2. `batch/src/lib/openai-client.ts` — **新規作成**
3. `batch/src/summary.ts` — `HandlerDependencies` 拡張、AI 処理ステップ追加
4. `batch/tests/unit/lib/openai-client.test.ts` — **新規作成**
5. `batch/tests/unit/summary.test.ts` — AI 処理のテストケース追加（依存注入でモック）

**AI 解析処理のロジック**:

```
handler() 起動時:
  1. 環境変数 OPENAI_API_KEY を取得（未設定の場合は全銘柄の AI をスキップ）

processExchange() 内のティッカーループ:
  2. 既存の OHLC・パターン取得・upsert を実行（変更なし）
  3. upsert 成功後、API キーが存在かつ AiAnalysis が undefined または null の場合のみ:
     a. AiAnalysisInput を構築（OHLC + パターン情報）
     b. generateAiAnalysis() を呼び出し（Web 検索付き OpenAI）
     c. 返却テキストを AiAnalysis フィールドとして再 upsert
     d. stats.aiAnalysisGenerated++
  4. AI 処理失敗時: AiAnalysis = null として再 upsert（失敗を明示記録）、logger.warn + stats.aiAnalysisSkipped++（既存処理継続）
```

**完了条件**: `batch` のユニットテストが全て通過し、`npm run build` が成功する。AI 処理のエラーが既存 stats.errors に混入しないこと。

---

### フェーズ C: Web パッケージの更新（UI 表示）

**目的**: API レスポンスと UI 型に `aiAnalysis` フィールドを追加し、ダイアログに「AI 解析」セクションを表示する。

**変更ファイル**:
1. `web/types/stock.ts` — `TickerSummary` に `aiAnalysis?: string | null` 追加（`null` = 生成失敗）
2. `web/app/api/summaries/route.ts` — `TickerSummaryResponse` に `aiAnalysis` 追加・マッピング追加
3. `web/app/summaries/page.tsx` — ダイアログの「パターン分析」の後に「AI 解析」セクション追加
4. `web/tests/unit/app/api/summaries/route.test.ts` — `aiAnalysis` のテストケース追加
5. `web/tests/unit/app/summaries-page.test.ts` — AI 解析セクション表示テスト追加
6. `web/tests/e2e/summary-display.spec.ts` — AI 解析セクションの E2E テスト追加

**UI 設計**:
```
ダイアログ（selectedTicker）:
  - 既存: 価格テーブル
  - 既存: <Divider />
  - 既存: パターン分析（買い・売り）
  - 追加: <Divider />
  - 追加: <Typography variant="h6">AI 解析</Typography>
  - 追加: aiAnalysis が string の場合 → <Typography variant="body2">{aiAnalysis}</Typography>
  - 追加: aiAnalysis が null の場合 → <Typography color="error.main">AI 解析の取得に失敗しました</Typography>
  - 追加: aiAnalysis が undefined の場合 → <Typography color="text.secondary">AI 解析はまだ生成されていません</Typography>
```

**完了条件**: `web` のユニットテストと E2E テストが全て通過し、`npm run build` が成功する。

---

## リスクと対策

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| OpenAI API レート制限 | 中 | 一部銘柄の AI 解析失敗 | 当該銘柄をスキップして継続。`AiAnalysis` 未設定のまま保存されるため、次回バッチで自動的に再生成される |
| バッチタイムアウト | 低 | 一部銘柄未処理 | 既存 skip ロジックと同様、完了分は保存済み |
| Secrets Manager 取得失敗 | 低 | 全銘柄の AI をスキップ | handler 起動時に一度だけ取得し、失敗時は null で全スキップ（既存処理は継続） |
| OpenAI Web 検索失敗 | 低 | Web 情報なしで解析テキスト生成 | OpenAI が自動フォールバック（追加対応不要） |
| `AiAnalysis` の大量 DynamoDB 書き込み | 低 | コスト増 | 既存の `AiAnalysis` が設定済みの場合は再生成しない（初回生成のみ） |

---

## 複雑性の追跡

> 憲法チェックに違反する事項なし。追加パッケージも不要。

---

## 成功基準との対応

| 成功基準 | 対応する実装 |
|---------|------------|
| SC-001: バッチタイムアウト内完了 | AI 処理は独立した try/catch で、失敗時はスキップして継続 |
| SC-002: 既存機能の 100% 正常動作 | AI 処理エラーが既存 stats.errors に影響しない分離設計 |
| SC-003: 追加ネットワークリクエストなし | API レスポンスに `aiAnalysis` を含め、ダイアログで即時表示 |
| SC-004: 解析テキストに価格動向・パターン・市場情報を含む | `web_search` 付き OpenAI プロンプトで実現 |
| SC-005: API キー取得失敗時の安全なスキップ | `apiKey = null` 時に AI 処理全体をスキップ |
