# Stock Tracker - Function Calling による AI 解析の詳細化

## 概要

Stock Tracker の AI 解析において、現在は OpenAI にプレーンテキスト（Markdown 形式の自由記述）で応答させているため、ティッカーによって出力項目や精度にばらつきが生じている。  
OpenAI の Structured Output（Function Calling / JSON Schema 指定）を導入することで、表示項目を統一し、フロントエンドでの構造化表示を可能にする。

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

-   NFR1: 既存の DynamoDB スキーマ変更は後方互換を保つこと（移行期間中に旧データが混在しても動作すること）
-   NFR2: Lambda のタイムアウト制約（現状 120 秒）内で完結すること
-   NFR3: TypeScript strict mode、テストカバレッジ 80% 以上を維持すること
-   NFR4: エラーメッセージは日本語かつ `ERROR_MESSAGES` 定数で管理すること

---

## 実装方針の検討

### 方針 A: Structured Output（JSON Schema 指定） ← **推奨**

OpenAI Responses API の `text.format` に `{ type: 'json_schema', json_schema: {...} }` を指定し、モデルに JSON 形式の構造化出力を強制する方法。

**メリット**:
-   出力形式が API レベルで保証される（パースエラーが発生しにくい）
-   Web 検索ツール（`web_search`）との併用が可能
-   Function Calling（`tools` に `function` 型追加）よりもシンプル

**懸念点**:
-   `gpt-5-mini` が Structured Output に対応しているか確認が必要
-   スキーマが複雑になると Tokens が増加する

### 方針 B: Function Calling（`tools` に function 定義を追加）

`tools` に `{ type: 'function', function: { name: 'report_analysis', parameters: {...} } }` を追加し、モデルにその関数を呼び出させる方法。

**メリット**:
-   既存の `tools: [{ type: 'web_search' }]` と共存できる
-   関数引数としてスキーマを定義できる

**懸念点**:
-   Responses API での function tool の使い方が Chat Completions API と異なる部分がある
-   Web 検索ツールと function を同時指定した場合の動作確認が必要

### 方針 C: プロンプトエンジニアリング（`response_format: json_object`）

プロンプトで「以下の JSON 形式で出力してください」と指示し、`response_format: { type: 'json_object' }` を指定する方法。

**メリット**:
-   実装変更が最小限

**懸念点**:
-   出力形式の保証がなく、キーの欠落やネスト構造のずれが起こりやすい
-   Web 検索ツールと JSON 形式指定の併用時に不安定になるケースがある

### 採用方針の結論（要調査確認項目）

1.  `gpt-5-mini`（OpenAI Responses API）での Structured Output サポート状況を確認する
2.  `web_search` ツールと `text.format: json_schema` の同時使用が可能かを公式ドキュメントで確認する
3.  上記が可能なら **方針 A**、不可なら **方針 B** を採用する

---

## 構造化出力スキーマ（案）

```
AiAnalysisResult:
  priceMovementAnalysis: string       // 当日の値動きの分析（日本語）
  patternAnalysis: string             // パターン分析の解釈（日本語）
  supportLevels: number[]             // サポートレベル（数値配列、1〜3個程度）
  resistanceLevels: number[]          // レジスタンスレベル（数値配列、1〜3個程度）
  relatedMarketTrend: string          // 関連市場・セクター動向（日本語）
  investmentJudgment:
    signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH'  // 投資シグナル
    reason: string                    // 判断理由（日本語）
```

---

## データモデル変更方針

### DailySummaryEntity の変更

現在の `AiAnalysis?: string` を構造化型に変更する。  
後方互換のために旧型（`string`）との Union 型、または JSON 文字列としてシリアライズして保存することを検討する。

推奨: 新フィールド `AiAnalysisResult` を追加し、既存の `AiAnalysis` は Deprecated として残す（移行後に削除）。

```
変更前: AiAnalysis?: string
変更後: AiAnalysis?: string          // Deprecated（後方互換用）
        AiAnalysisResult?: AiAnalysisResult  // 新構造化フィールド
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

### Phase 1: 調査・方針確定

-   [ ] T001: `gpt-5-mini`（OpenAI Responses API）での Structured Output（`text.format: json_schema`）サポートを公式ドキュメントで確認する
-   [ ] T002: `web_search` ツールと Structured Output の同時指定の可否を確認する
-   [ ] T003: Function Calling（方針 B）と Structured Output（方針 A）の選定結論を出す
-   [ ] T004: 出力スキーマの項目・型を確定する（上記案を起点にレビューする）
-   [ ] T005: DynamoDB の後方互換方針（新フィールド追加 vs 既存フィールド上書き）を確定する

### Phase 2: コア実装（batch / core）

-   [ ] T006: `AiAnalysisResult` インターフェースを定義する（`core/src/entities/` または `batch/src/lib/`）
-   [ ] T007: `openai-client.ts` を Structured Output / Function Calling に対応させる
    -   スキーマ定義の追加
    -   レスポンスのパース処理
    -   戻り値を `string` から `AiAnalysisResult` に変更
-   [ ] T008: `daily-summary.entity.ts` に `AiAnalysisResult` フィールドを追加する
-   [ ] T009: `daily-summary.mapper.ts` に `AiAnalysisResult` の変換ロジックを追加する
-   [ ] T010: `batch/src/summary.ts` の呼び出し側を新インターフェースに対応させる

### Phase 3: フロントエンド実装（web）

-   [ ] T011: `web/types/stock.ts` の `TickerSummary` に `aiAnalysisResult` フィールドを追加する
-   [ ] T012: `web/app/summaries/ai-analysis.ts` を更新する（構造化データ対応）
-   [ ] T013: `web/app/summaries/page.tsx` の AI 解析セクションを構造化表示 UI に変更する
    -   当日の値動き分析テキスト
    -   パターン分析テキスト
    -   サポート・レジスタンスレベルの数値表示
    -   関連市場動向テキスト
    -   投資判断（シグナル + 理由）
-   [ ] T014: 後方互換として旧 `aiAnalysis` 文字列が残っている場合のフォールバック表示を実装する

### Phase 4: テスト・品質保証

-   [ ] T015: `openai-client.ts` のユニットテストを更新する（新スキーマのモックレスポンス対応）
-   [ ] T016: `daily-summary.mapper.ts` のユニットテストを更新する
-   [ ] T017: `ai-analysis.ts` のユニットテストを更新する
-   [ ] T018: サマリーページの E2E テストで AI 解析表示を確認する（構造化 UI のアクセシビリティ）
-   [ ] T019: テストカバレッジが 80% 以上であることを確認する

### Phase 5: ドキュメント更新

-   [ ] T020: `docs/services/stock-tracker/architecture.md` の「3.2.2 AI 解析の設計方針」を更新する
-   [ ] T021: `docs/services/stock-tracker/api-spec.md` の `AiAnalysis` 関連レスポンス仕様を更新する

---

## 参考ドキュメント

-   [Stock Tracker アーキテクチャ設計書](../docs/services/stock-tracker/architecture.md)
-   [Stock Tracker API 仕様](../docs/services/stock-tracker/api-spec.md)
-   [コーディング規約](../docs/development/rules.md)
-   OpenAI Responses API Structured Output: https://platform.openai.com/docs/guides/structured-outputs
-   OpenAI Function Calling: https://platform.openai.com/docs/guides/function-calling

---

## 備考・未決定事項

-   `gpt-5-mini` のモデル名が正式な OpenAI モデル識別子かどうか要確認（リポジトリ内コードに記載された名称を使用している）
-   サポート・レジスタンスの数値個数（1〜3個の上限設定、または固定数にするか）は調査後に確定する
-   投資判断のシグナル値の列挙（`BULLISH / NEUTRAL / BEARISH` か、より細分化するか）は要検討
-   Web 検索ツールの利用により API コストが増加する可能性があるため、コスト試算も行う
-   DynamoDB の既存データとの後方互換（旧形式の `AiAnalysis` 文字列が残っている状態での UI 表示）を設計する
