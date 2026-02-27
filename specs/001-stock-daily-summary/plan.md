# 実装計画: Stock Tracker 日次サマリー表示

**ブランチ**: `001-stock-daily-summary` | **日付**: 2026-02-27 | **仕様**: [spec.md](./spec.md)
**入力**: `/specs/001-stock-daily-summary/spec.md` の機能仕様書

## 概要

Stock Tracker に日次サマリー表示機能を追加する。取引所ごとに取引時間終了後のティッカーの始値・高値・安値・終値をまとめ、1時間間隔の新規バッチ（既存アラートバッチとは独立）で DynamoDB に保存する。ユーザーは Web 画面から取引所ごとにグループ化された最新サマリー一覧を閲覧できる。

主な技術的アプローチ:
- 新規バッチ `summary.ts`: `isTradingHours` で取引終了取引所を検出し、`getChartData('D')` で日次 OHLCV を取得して DynamoDB に Upsert
- 新エンティティ `DailySummary`: 既存 Single Table Design に追加（GSI4 新設）
- 新 API エンドポイント: `GET /api/summaries` → 取引所ごとの最新サマリーを返す
- 新 Web ページ: `/summaries` → 取引所グループ化表示（Material-UI + Next.js）

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.x / Node.js 22+
**主要な依存関係**: Next.js（Web）、AWS Lambda（Batch）、@nagiyu/stock-tracker-core、@mathieuc/tradingview、date-fns-tz、@aws-sdk/lib-dynamodb、Material-UI
**ストレージ**: DynamoDB（既存シングルテーブル `nagiyu-stock-tracker-main-{env}`）
**テスト**: Jest（ユニット）、Playwright（E2E）
**ターゲットプラットフォーム**: AWS Lambda（Batch）、Next.js on ECS/CloudFront（Web）
**プロジェクト種別**: core + web + batch（既存パッケージに追加）
**パフォーマンス目標**: サマリー画面 3秒以内表示（SC-002）
**制約**: スマホファースト、既存バッチ（hourly.ts）との完全独立運用、DynamoDB シングルテーブル継続
**スコープ**: 全ティッカー分の日次サマリー（1取引所あたり数十〜数百銘柄想定）

## 憲法チェック

*ゲート: フェーズ0の調査前に通過すること。フェーズ1の設計後に再チェックすること。*

- [x] **TypeScript 型安全性 (I)**: 既存 strict mode 継承。DailySummary エンティティ・型定義は `core/src/types.ts` と `core/src/entities/` に集約。アクセス修飾子は既存パターン（DynamoDBXxxRepository）に準拠
- [x] **アーキテクチャ・レイヤー分離 (II)**: core（エンティティ/リポジトリ/ビジネスロジック）→ batch（サマリー生成ロジック）→ web（API/UI）の一方向依存。core はフレームワーク非依存を維持
- [x] **コード品質・Lint・フォーマット (III)**: 既存 eslint.config.mjs・prettier 設定を継承。エラーメッセージは ERROR_MESSAGES 定数で管理（既存パターン）
- [x] **テスト戦略 (IV)**: batch ユニットテスト（Jest）、core ユニットテスト（Jest、80% カバレッジ）、web E2E（Playwright、chromium-mobile 優先）
- [x] **ブランチ戦略・CI/CD (V)**: 既存 stock-tracker-verify-fast.yml / stock-tracker-verify-full.yml を活用（バッチ・コア・ウェブの変更を検出）
- [x] **共通ライブラリ設計 (VI)**: core は `@nagiyu/aws`、`@nagiyu/common` のみ依存（既存通り）。batch は `@nagiyu/stock-tracker-core`、`@nagiyu/common` のみ依存。web は `@nagiyu/stock-tracker-core`、`@nagiyu/ui` 等に依存可
- [x] **ドキュメント駆動開発 (VII)**: 本計画書含む成果物はすべて日本語で作成

## プロジェクト構成

### ドキュメント（本機能）

```text
specs/001-stock-daily-summary/
├── plan.md              # 本ファイル
├── research.md          # フェーズ0の出力
├── data-model.md        # フェーズ1の出力
├── contracts/           # フェーズ1の出力
│   └── GET-api-summaries.md
├── quickstart.md        # フェーズ1の出力
└── tasks.md             # フェーズ2の出力（/speckit.tasks コマンドで作成）
```

### ソースコード（リポジトリルート）

```text
services/stock-tracker/
├── core/
│   └── src/
│       ├── entities/
│       │   └── daily-summary.entity.ts    # 新規: DailySummaryEntity
│       ├── mappers/
│       │   └── daily-summary.mapper.ts    # 新規: DailySummaryMapper
│       ├── repositories/
│       │   ├── daily-summary.repository.interface.ts        # 新規
│       │   ├── dynamodb-daily-summary.repository.ts         # 新規
│       │   └── in-memory-daily-summary.repository.ts        # 新規
│       └── types.ts                       # 更新: DailySummary 型追加
├── batch/
│   └── src/
│       └── summary.ts                     # 新規: 日次サマリー生成バッチ（1時間間隔）
├── web/
│   ├── app/
│   │   ├── api/
│   │   │   └── summaries/
│   │   │       └── route.ts               # 新規: GET /api/summaries
│   │   └── summaries/
│   │       └── page.tsx                   # 新規: サマリー一覧ページ
│   ├── lib/
│   │   └── repository-factory.ts          # 更新: DailySummaryRepository 追加
│   └── types/
│       └── stock.ts                       # 更新: DailySummary UI 型追加（必要時）
└── infra/stock-tracker/
    ├── lib/
    │   ├── dynamodb-stack.ts              # 更新: GSI4 (ExchangeSummaryIndex) 追加
    │   ├── eventbridge-stack.ts           # 更新: SummaryHourly ルール追加
    │   └── lambda-stack.ts               # 更新: summary Lambda 追加
    └── ...
```

**構成の決定**: core + web + batch の既存3パッケージ構成を維持。インフラ（CDK）も既存構成を拡張。

## 複雑性の追跡

> **憲法チェックに違反があり正当化が必要な場合のみ記入**

| 違反内容 | 必要な理由 | よりシンプルな代替案を却下した理由 |
|---------|------------|----------------------------------|
| GSI4 新設（DynamoDB スタック変更） | 取引所ごとの最新サマリー取得を効率化するため | Scan + フィルタでは大量データ時のコスト・レイテンシが許容範囲外になる恐れ |
| Lambda 追加（summary.ts） | FR-001: 既存 hourly.ts とは独立したバッチを新設すること（MUST） | 既存 hourly.ts への統合は FR-001 に違反する |
