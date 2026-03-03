# フェーズ0 調査結果: Stock Tracker AI 解析機能

**ブランチ**: `001-stock-ai-analysis` | **日付**: 2026-03-03

---

## 調査項目一覧

| 項目 | 状態 | 決定 |
|------|------|------|
| OpenAI Responses API による Web 検索 | ✅ 解決済み | `gpt-5-mini` + `web_search` ツール |
| AWS Secrets Manager 取得方法 | ✅ 解決済み | Secrets Manager に保管し CDK デプロイ時に Lambda 環境変数として注入 |
| `DailySummaryEntity` への AI フィールド追加 | ✅ 解決済み | `AiAnalysis?: string` を既存 entity に追加 |
| バッチ処理のエラー分離戦略 | ✅ 解決済み | try/catch で AI 処理を完全分離、既存処理を継続 |
| Web UI 側の表示方法 | ✅ 解決済み | 既存ダイアログに「AI 解析」セクションを追加 |

---

## 1. OpenAI API 統合

### 決定
- **モデル**: `gpt-5-mini`
- **API**: OpenAI Responses API (`POST /v1/responses`)
- **Web 検索**: `web_search` built-in ツールを使用
- **ライブラリ**: `openai` npm パッケージ (`^6.x`)

### 根拠
OpenAI の Responses API は built-in ツールとして `web_search` を提供しており、外部検索 API を別途呼び出すことなく Web 検索結果を解析コンテキストに含められる。Chat Completions API + function calling で自前の検索を実装する代替案より、シンプルかつ確実。GPT-5 系の Responses API では `web_search_preview` は `web_search` に統合された。

### 代替案の却下理由
- **Perplexity API**: 別サービスへの依存が増える。OpenAI 単体で完結させる方が保守しやすい。
- **Chat Completions + 手動検索**: 検索ステップが別途必要でコードが複雑化する。
- **Gemini Web Search**: 仕様で OpenAI 限定と制約されている。

### Responses API プロンプト設計

```
システムプロンプト:
  あなたは株式市場の専門アナリストです。与えられた株式データを分析し、
  日本語で簡潔な解析レポートを作成してください。

ユーザープロンプト:
  銘柄: {TickerID}（{Name}）
  解析対象日: {Date}

  ## 直近の価格推移（OHLC）
  始値: {Open} | 高値: {High} | 安値: {Low} | 終値: {Close}

  ## パターン分析結果
  買いシグナル合致数: {BuyPatternCount}
  売りシグナル合致数: {SellPatternCount}
  検出パターン: {PatternSummary}

  上記のデータと最新の市場情報（Web 検索）を踏まえ、以下を含む解析レポートを日本語で作成してください:
  1. 価格動向の解釈
  2. パターン分析の意味
  3. 関連する市場・セクター動向
```

### 実装コード概要

```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey });
const response = await client.responses.create({
  model: 'gpt-5-mini',
  tools: [{ type: 'web_search' }],
  input: prompt,
});
// response.output_text でテキスト取得
```

---

## 2. API キー管理

### 決定
- **管理方法**: AWS Secrets Manager にシークレットとして保管し、CDK デプロイ時に Lambda 環境変数へ注入
- **実行時取得**: バッチコードは `process.env.OPENAI_API_KEY` を直接参照（Secrets Manager SDK 不要）
- **SDK 不要**: 既存の VAPID キーと同一パターン（deploy workflow が Secrets Manager から取得して CDK context に渡す）
- **シークレット名**: `nagiyu-stock-tracker-openai-api-key-${environment}`（Secrets Stack で管理）

### 根拠
既存パターンと同様に、CDK デプロイ時にシークレット値を取得して Lambda 環境変数として設定することで、ランタイムでの Secrets Manager 呼び出し回数を抑制できる。`@aws-sdk/client-secrets-manager` を batch の runtime 依存に追加する必要がなく、コードが簡潔になる。

### 実装コード概要

```typescript
// batch/src/summary.ts の handler() 内
const apiKey = process.env.OPENAI_API_KEY ?? null;
// apiKey が null の場合は全銘柄の AI 処理をスキップ
```

### インフラ側の対応（実装時参照）
- `infra/stock-tracker/lib/secrets-stack.ts`: `openai-api-key` シークレットを追加
- `infra/stock-tracker/lib/lambda-stack.ts`: `batchSummaryFunction` の environment に `OPENAI_API_KEY` を追加
- `.github/workflows/stock-tracker-deploy.yml`: `aws-actions/aws-secretsmanager-get-secrets` でシークレットを取得し CDK context に渡す

### セキュリティ考慮事項
- API キーはログに出力しない（MUST NOT）
- シークレット名はハードコードせず Secrets Stack で一元管理する

---

## 3. DailySummary エンティティ拡張

### 決定
- `DailySummaryEntity` に `AiAnalysis?: string` フィールドを追加
- `CreateDailySummaryInput` も自動的にこのフィールドを含む（`Omit<DailySummaryEntity, 'CreatedAt' | 'UpdatedAt'>` のため）
- DynamoDB のアイテムキー設計は変更なし（既存 `SUMMARY#{TickerID}` / `DATE#{Date}`）
- `DailySummaryMapper` の `toItem` / `toEntity` / `toTickerSummaryResponse` を更新

### 根拠
既存の `DailySummaryEntity` は `PatternResults` 等も optional なフィールドとして持っており、`AiAnalysis` を同様のパターンで追加すれば後方互換性が保たれる。データモデルの変更範囲が最小で済む。

### 代替案の却下理由
- **別テーブル**: 複雑さが増し、DynamoDB Single Table Design の原則に反する。
- **別 DynamoDB アイテム (SK: AI_ANALYSIS)**: サマリー取得クエリを2回叩く必要が生じ、パフォーマンスが悪化する。

---

## 4. バッチ処理のエラー分離戦略

### 決定
- AI 処理を `processAiAnalysis(ticker, summary)` として独立した非同期関数に切り出す
- `summary.ts` の `processExchange` 内で、`upsert()` 成功後に `try/catch` で AI 処理を呼び出す
- AI 処理失敗時は `logger.warn` でログを記録し、`stats.aiErrors` カウンタをインクリメント
- AI 処理成功時は `AiAnalysis` フィールドを含めて再 `upsert()` を実行（部分更新）

### 根拠
既存の `processExchange` が try/catch でティッカー単位のエラーを吸収する設計と整合する。AI 処理エラーが既存の `stats.errors` に混入しないよう、専用カウンタを用意することで監視・デバッグが容易になる。

---

## 5. Web UI 表示方針

### 決定
- `TickerSummary` 型に `aiAnalysis?: string` を追加
- `GET /api/summaries` レスポンスの `TickerSummaryResponse` にも `aiAnalysis?: string` を追加
- `summaries/page.tsx` の既存ダイアログの「パターン分析」セクションの後に `<Divider />` + 「AI 解析」セクションを追加
- AI 解析テキストが未取得の場合は「AI 解析はまだ生成されていません」と表示

### 根拠
追加のネットワークリクエストなしで即時表示（SC-003）。既存のダイアログ構造を拡張するだけで UI 変更が最小化される。

---

## 技術スタック確認

| 技術 | バージョン | 用途 |
|------|-----------|------|
| `openai` | ^6.x | OpenAI API クライアント |
| TypeScript | 5.x | 既存に準拠 |
| DynamoDB (Single Table) | 既存 | `AiAnalysis` フィールド追加 |
| Next.js (App Router) | 既存 | Web UI |
| Material-UI | 既存 | UI コンポーネント |

---

## 未解決事項

なし。すべての NEEDS CLARIFICATION が解決済み。
