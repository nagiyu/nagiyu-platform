# クイックスタート: Stock Tracker AI 解析機能

**対象読者**: 本機能の実装担当者  
**最終更新**: 2026-03-03

---

## 前提条件

- 既存の `services/stock-tracker/` の開発環境が動作していること
- AWS 認証情報が設定されていること（Secrets Manager アクセス用）
- OpenAI API アカウントと API キーがあること

---

## セットアップ手順

### 1. 依存パッケージの追加

```bash
# モノレポルートから実行
npm install openai --workspace=@nagiyu/stock-tracker-batch
```

### 2. 環境変数の設定

```bash
# services/stock-tracker/batch/.env.local（ローカル開発用）
OPENAI_API_KEY=sk-proj-xxxx...
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=<テーブル名>
```

### 3. インフラ側の対応（CDK デプロイ時）

OpenAI API キーは AWS Secrets Manager に保管し、CDK デプロイ時に Lambda 環境変数として注入される（既存 VAPID キーと同一パターン）。

```bash
# Secrets Manager にシークレットを登録（初回のみ）
aws secretsmanager create-secret \
  --name "nagiyu-stock-tracker-openai-api-key-dev" \
  --secret-string "sk-proj-xxxx..."
```

### 4. ビルドと確認

```bash
# coreパッケージをビルド（DailySummaryEntity変更を反映）
npm run build --workspace=@nagiyu/stock-tracker-core

# batchパッケージをビルド
npm run build --workspace=@nagiyu/stock-tracker-batch

# webパッケージをビルド
npm run build --workspace=@nagiyu/stock-tracker-web
```

---

## 実装ファイル一覧

### Core パッケージ（`@nagiyu/stock-tracker-core`）

| ファイル | 変更内容 |
|---------|---------|
| `core/src/entities/daily-summary.entity.ts` | `AiAnalysis?: string` フィールドを追加 |
| `core/src/mappers/daily-summary.mapper.ts` | `toItem` / `toEntity` / `toTickerSummaryResponse` に `AiAnalysis` 対応を追加 |

### Batch パッケージ（`@nagiyu/stock-tracker-batch`）

| ファイル | 変更内容 |
|---------|---------|
| `batch/src/lib/openai-client.ts` | **新規作成**: OpenAI Responses API で AI 解析テキストを生成 |
| `batch/src/summary.ts` | `HandlerDependencies` と `BatchStatistics` 拡張、AI 処理ステップを追加 |
| `batch/package.json` | `openai` 依存追加 |

### Web パッケージ（`@nagiyu/stock-tracker-web`）

| ファイル | 変更内容 |
|---------|---------|
| `web/types/stock.ts` | `TickerSummary` に `aiAnalysis?: string` を追加 |
| `web/app/api/summaries/route.ts` | `TickerSummaryResponse` に `aiAnalysis` を追加、`toTickerSummaryResponse` からマッピング |
| `web/app/summaries/page.tsx` | ダイアログに「AI 解析」セクションを追加 |

---

## テスト方法

### ユニットテスト

```bash
# Batch
npm test --workspace=@nagiyu/stock-tracker-batch

# Core
npm test --workspace=@nagiyu/stock-tracker-core

# Web
npm test --workspace=@nagiyu/stock-tracker-web
```

### ローカル動作確認

```bash
# バッチを手動実行（ローカル）
npm run build --workspace=@nagiyu/stock-tracker-batch
node services/stock-tracker/batch/dist/summary.js

# Web を起動してサマリー画面を確認
npm run dev --workspace=@nagiyu/stock-tracker-web
# http://localhost:3000/summaries でダイアログの「AI 解析」セクションを確認
```

---

## 主要な実装パターン

### バッチの AI 処理フロー

```typescript
// summary.ts の handler() 内
// summary.ts の handler() 内
const apiKey = process.env.OPENAI_API_KEY ?? null;

// processExchange 内のティッカーループで：
// 既存の upsert() 成功後、AI 解析を試みる
if (apiKey && !existingSummary?.AiAnalysis) {
  try {
    const aiAnalysis = await dependencies.generateAiAnalysisFn?.(apiKey, input);
    if (aiAnalysis) {
      await dependencies.dailySummaryRepository.upsert({
        ...savedSummary,
        AiAnalysis: aiAnalysis,
      });
      stats.aiAnalysisGenerated++;
    }
  } catch (error) {
    logger.warn('AI 解析の生成に失敗しました', { tickerId: ticker.TickerID, error });
    stats.aiAnalysisSkipped++;
  }
}
```

### エラーハンドリング原則

- `OPENAI_API_KEY` 未設定 → 全銘柄の AI 処理をスキップ（バッチは継続）
- OpenAI API 失敗 → 当該銘柄の AI 処理をスキップ（`AiAnalysis` 未設定のまま保存。次回バッチで自動再生成）
- 既存 upsert 失敗 → 既存の `stats.errors` としてカウント（変更なし）
- AI 処理は常に既存処理の **後に** 実行し、既存処理に影響させない

---

## トラブルシューティング

| 症状 | 原因 | 対応 |
|------|------|------|
| `AI 解析をスキップ` がログに出力される | `OPENAI_API_KEY` 環境変数が未設定 | Lambda の環境変数設定を確認 |
| AI 解析テキストが表示されない | バッチ未実行 | バッチを手動実行して再確認 |
| `aiAnalysis` が空 | OpenAI API エラー | バッチログを確認し再実行 |
| ビルドエラー（`AiAnalysis` 関連） | core の再ビルド忘れ | `core` → `batch` → `web` の順にビルド |
