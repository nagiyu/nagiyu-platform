# Stock Tracker - Function Calling による AI 解析の詳細化

## 概要

Stock Tracker の AI 解析において、現在は OpenAI にプレーンテキスト（Markdown 形式の自由記述）で応答させているため、ティッカーによって出力項目や精度にばらつきが生じている。  
OpenAI Responses API の Structured Output（`text.format: json_schema`）を導入することで、表示項目を統一し、フロントエンドでの構造化表示を可能にする。

## 関連情報

-   Issue: #（Function Calling による AI 解析の詳細化）
-   タスクタイプ: サービスタスク（stock-tracker）
-   影響範囲: `services/stock-tracker/batch/`, `services/stock-tracker/core/`, `services/stock-tracker/web/`

---

## 現状の実装

### AI 解析フロー

1. Lambda バッチ（`batch/src/summary.ts`）が定期実行
2. `batch/src/lib/openai-client.ts` で OpenAI Responses API（`client.responses.create()`）を呼び出し
3. モデル: `gpt-5-mini`、Web 検索ツール（`{ type: 'web_search' }`）有効
4. プロンプトで「2000文字以内の解析文を日本語で」と指示し、**自由形式のテキスト**を取得
5. 取得テキストを DynamoDB の `AiAnalysis` フィールド（`string`）に保存
6. フロントエンドは読み取り専用 TextField でそのまま表示

### 課題

-   ティッカーごとに出力項目がばらつく（銘柄によって「投資判断」が含まれないなど）
-   フロントエンドが構造を前提とした UI を作れない（現在は単なるテキストエリア）
-   サポート・レジスタンスの数値など機械的に利用できる情報が取れない

---

## 要件

### 機能要件

-   FR1: AI 解析結果が以下の項目を**必ず**含む形で返却されること
    -   当日の値動きの分析（日本語テキスト）
    -   パターン分析の解釈（日本語テキスト）
    -   サポートレベルの数値（1〜3個程度）
    -   レジスタンスレベルの数値（1〜3個程度）
    -   関連市場・セクター動向（Web 検索を活用した日本語テキスト）
    -   投資判断（強気 / 中立 / 弱気 などの列挙値 + 理由テキスト）
-   FR2: 既存の「AI 解析未生成」「AI 解析失敗」の状態区別は維持されること
-   FR3: AI 解析が失敗しても既存の日次サマリー機能は継続すること
-   FR4: フロントエンドでは各項目を個別に表示できること（単一テキストエリアからの脱却）
-   FR5: Web 検索機能（`web_search` ツール）との併用が維持されること

### 非機能要件

-   NFR1: Lambda のタイムアウト制約（現状 120 秒）内で完結すること
-   NFR2: TypeScript strict mode、テストカバレッジ 80% 以上を維持すること
-   NFR3: エラーメッセージは日本語かつ `ERROR_MESSAGES` 定数で管理すること

---

## 実装方針

### 採用方針: Structured Output（`text.format: json_schema`）

調査の結果、以下がすべて確認できたため **Structured Output を採用**する。

**確認済み事項**:
-   `gpt-5-mini` は OpenAI Responses API の Structured Output（`text.format: json_schema`）をサポートしている
-   `web_search` ツールと `text.format: json_schema` の**同時使用が可能**である（Responses API の設計として両立する）
-   `client.responses.parse()` メソッドを使用することで `response.output_parsed` から型安全なオブジェクトを直接取得できる
-   スキーマには `additionalProperties: false` および全フィールドを `required` として設定することで厳密なスキーマ準拠が保証される
-   Zod でスキーマを定義することで TypeScript の型安全性を確保できる

**Function Calling（`tools` に function 追加）を採用しない理由**:
-   Structured Output の方がシンプルかつ信頼性が高い
-   `text.format: json_schema` が API レベルで出力形式を保証するため、パースエラーのリスクが低い
-   `output_parsed` によりレスポンスの型安全なアクセスが実現できる

### 実装パターン（TypeScript）

`client.responses.create()` から `client.responses.parse()` に変更し、Zod スキーマを `text_format` に渡す。

```
// Zod スキーマを定義（TypeScript の型も自動生成される）
const AiAnalysisResultSchema = z.object({
  priceMovementAnalysis: z.string(),
  patternAnalysis: z.string(),
  supportLevels: z.tuple([z.number(), z.number(), z.number()]),
  resistanceLevels: z.tuple([z.number(), z.number(), z.number()]),
  relatedMarketTrend: z.string(),
  investmentJudgment: z.object({
    signal: z.enum(['BULLISH', 'NEUTRAL', 'BEARISH']),
    reason: z.string(),
  }),
});

// client.responses.parse() で呼び出す
const response = await client.responses.parse({
  model: 'gpt-5-mini',
  stream: false,
  tools: [{ type: 'web_search' }],
  text_format: AiAnalysisResultSchema,  // Zod スキーマを直接渡す
  input: [...],
});

// output_parsed から型安全なオブジェクトを取得
const result = response.output_parsed;  // z.infer<typeof AiAnalysisResultSchema> 型
```

**注意点**:
-   `client.responses.parse()` は `client.responses.create()` のラッパーであり、追加のランタイムコストはほぼない
-   スキーマの全プロパティは `required` とする（オプショナルフィールドはモデルが埋められないケースで問題になる可能性）
-   Web 検索結果を構造化出力に統合するため、プロンプトでも各フィールドの意図を明示する

---

## 構造化出力スキーマ（案）

```
AiAnalysisResult:
  priceMovementAnalysis: string       // 当日の値動きの分析（日本語）
  patternAnalysis: string             // パターン分析の解釈（日本語）
  supportLevels: [number, number, number]     // サポートレベル（数値3個固定）
  resistanceLevels: [number, number, number]  // レジスタンスレベル（数値3個固定）
  relatedMarketTrend: string          // 関連市場・セクター動向（日本語）
  investmentJudgment:
    signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH'  // 投資シグナル
    reason: string                    // 判断理由（日本語）
```

---

## データモデル変更方針

### DailySummaryEntity の変更

現在の `AiAnalysis?: string` を削除し、`AiAnalysisResult` 構造化型に置き換える。  
実装は一括で行うため後方互換は考慮しない。

```
変更前: AiAnalysis?: string
変更後: AiAnalysisResult?: AiAnalysisResult  // 構造化フィールド（supportLevels/resistanceLevels は各3個固定）
```

DynamoDB 保存時は `AiAnalysisResult` を JSON 文字列としてシリアライズする。

---

## 影響ファイル

| ファイル | 変更内容 |
| --- | --- |
| `batch/src/lib/openai-client.ts` | Structured Output 対応（スキーマ定義・レスポンスのパース） |
| `core/src/entities/daily-summary.entity.ts` | `AiAnalysisResult` 型の追加 |
| `core/src/mappers/daily-summary.mapper.ts` | `AiAnalysisResult` の DynamoDB ↔ エンティティ変換 |
| `web/types/stock.ts` | `TickerSummary` に `aiAnalysisResult` フィールド追加 |
| `web/app/summaries/page.tsx` | AI 解析セクションを構造化表示 UI に変更 |
| `web/app/summaries/ai-analysis.ts` | 新構造に対応した表示ロジック更新 |
| `web/lib/error-messages.ts` | 必要に応じてエラーメッセージ追加 |
| `docs/services/stock-tracker/architecture.md` | AI 解析設計方針の更新 |

---

## タスク

### Phase 1: コア実装（batch / core）

-   [ ] T001: `zod` を `batch/` の依存関係に追加する（Structured Output スキーマ定義用）
-   [ ] T002: `AiAnalysisResult` 型（Zod スキーマ + 推論型）を定義する（`batch/src/lib/openai-client.ts` 内）
-   [ ] T003: `openai-client.ts` を Structured Output に対応させる
    -   `client.responses.create()` → `client.responses.parse()` に変更
    -   `text_format` に Zod スキーマを渡す
    -   戻り値を `string` から `AiAnalysisResult` に変更
    -   プロンプトに各フィールドの出力指示を明示する
-   [ ] T004: `daily-summary.entity.ts` の `AiAnalysis?: string` を `AiAnalysisResult?: AiAnalysisResult` に変更する
-   [ ] T005: `daily-summary.mapper.ts` に `AiAnalysisResult` の DynamoDB 変換ロジック（JSON シリアライズ/デシリアライズ）を追加する
-   [ ] T006: `batch/src/summary.ts` の呼び出し側を新インターフェースに対応させる

### Phase 2: フロントエンド実装（web）

-   [ ] T007: `web/types/stock.ts` の `TickerSummary` の `aiAnalysis?: string` を `aiAnalysisResult?: AiAnalysisResult` に変更する
-   [ ] T008: `web/app/summaries/ai-analysis.ts` を削除または構造化データ対応に更新する
-   [ ] T009: `web/app/summaries/page.tsx` の AI 解析セクションを構造化表示 UI に変更する
    -   当日の値動き分析テキスト
    -   パターン分析テキスト
    -   サポート・レジスタンスレベルの数値表示
    -   関連市場動向テキスト
    -   投資判断（シグナル + 理由）

### Phase 3: テスト・品質保証

-   [ ] T010: `openai-client.ts` のユニットテストを更新する（新スキーマのモックレスポンス対応）
-   [ ] T011: `daily-summary.mapper.ts` のユニットテストを更新する
-   [ ] T012: サマリーページの E2E テストで AI 解析表示を確認する（構造化 UI のアクセシビリティ）
-   [ ] T013: テストカバレッジが 80% 以上であることを確認する

### Phase 4: ドキュメント更新

-   [ ] T014: `docs/services/stock-tracker/architecture.md` の「3.2.2 AI 解析の設計方針」を更新する
-   [ ] T015: `docs/services/stock-tracker/api-spec.md` の `AiAnalysis` 関連レスポンス仕様を更新する

---

## 参考ドキュメント

-   [Stock Tracker アーキテクチャ設計書](../docs/services/stock-tracker/architecture.md)
-   [Stock Tracker API 仕様](../docs/services/stock-tracker/api-spec.md)
-   [コーディング規約](../docs/development/rules.md)
-   OpenAI Responses API Structured Output: https://platform.openai.com/docs/guides/structured-outputs
-   OpenAI Responses API - TypeScript SDK: https://github.com/openai/openai-node

---

## 備考・未決定事項

（現時点で未決定の事項はない）
