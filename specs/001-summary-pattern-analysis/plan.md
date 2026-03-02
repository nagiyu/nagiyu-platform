# 実装計画: Stock Tracker サマリー日足パターン分析

**ブランチ**: `001-summary-pattern-analysis` | **日付**: 2026-03-01 | **仕様**: [spec.md](./spec.md)
**入力**: `/specs/001-summary-pattern-analysis/spec.md` の機能仕様書

## 概要

サマリーバッチ実行時に各ティッカーの過去50日分の日足データを取得し、三川明けの明星（買いシグナル）と三川宵の明星（売りシグナル）のパターン分析を実施する。分析結果は DailySummary エンティティに統合して DynamoDB へ保存し、サマリー API と UI（一覧カラム + 詳細ダイアログ）で閲覧できるようにする。

パターン実装は抽象基底クラス `CandlestickPattern` を導入し、各パターン（`MorningStar`、`EveningStar`）はそこから派生させる。これにより将来の新パターン追加が容易になる。

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.x / Node.js 22+
**主要な依存関係**: Next.js 15, React 19, MUI, @aws-sdk/lib-dynamodb, @mathieuc/tradingview, Jest, Playwright
**ストレージ**: DynamoDB Single Table Design（既存テーブルを拡張）
**テスト**: Jest（ユニット・カバレッジ80%以上）、Playwright（E2E: chromium-mobile / chromium-desktop / webkit-mobile）
**ターゲットプラットフォーム**: AWS Lambda（batch）、Next.js on ECS/Vercel（web）
**プロジェクト種別**: core + web + batch（既存構成を拡張）
**パフォーマンス目標**: サマリー一覧表示 10 秒以内（SC-002）、バッチ処理は既存の許容範囲内
**制約**: スマホファースト、パターン定義はシステム固定（ユーザー編集不可）、将来パターン追加を容易にする基底クラス設計
**スコープ**: 登録済みティッカー全数（現状数十〜数百銘柄）、パターン初版2種

## 憲法チェック

*ゲート: フェーズ0の調査前に通過すること。フェーズ1の設計後に再チェックすること。*

- [x] **TypeScript 型安全性 (I)**: 既存の `strict: true` 継承。新型定義は `core/src/types.ts` および `web/types/stock.ts` に集約。抽象クラス・派生クラスのアクセス修飾子を明示する。
- [x] **アーキテクチャ・レイヤー分離 (II)**: パターンロジックは `core/src/patterns/` に配置（フレームワーク非依存）。憲法 II は「ビジネスロジックは `src/libs/` に配置（MUST）」と規定するが、`patterns/` はキャンドルスティックパターン専用のサブカテゴリであり `libs/` と同一の責務分類（純粋関数・フレームワーク非依存）を満たす。将来のパターン追加に備え専用ディレクトリとして切り出す設計を採用する。`batch` が `core` に依存、`web` が `core` に依存する方向性を維持。
- [x] **コード品質・Lint・フォーマット (III)**: 既存 ESLint / Prettier 設定を継承。新ファイルも同設定に準拠。
- [x] **テスト戦略 (IV)**: パターン純粋ロジック（`analyze()`）は Jest ユニットテストで80%以上。UI 変更は Playwright E2E でカバー。
- [x] **ブランチ戦略・CI/CD (V)**: `feature/StockTracker/001-summary-pattern-analysis` → `integration/StockTracker` → `develop` → `master` の順でマージ。既存 verify-fast / verify-full ワークフローを利用。
- [x] **共通ライブラリ設計 (VI)**: `core` は `@nagiyu/common`・`@nagiyu/aws` のみに依存。`@nagiyu/ui` や `@nagiyu/browser` へは依存しない。パスエイリアス不使用。
- [x] **ドキュメント駆動開発 (VII)**: 本 plan.md 以降の成果物はすべて日本語で作成。

## プロジェクト構成

### ドキュメント（本機能）

```text
specs/001-summary-pattern-analysis/
├── plan.md              # 本ファイル
├── research.md          # フェーズ0の出力
├── data-model.md        # フェーズ1の出力
├── quickstart.md        # フェーズ1の出力
├── contracts/
│   └── api.md           # フェーズ1の出力（API コントラクト変更）
└── tasks.md             # フェーズ2の出力 (/speckit.tasks コマンドで作成)
```

### ソースコード（リポジトリルート）

```text
services/stock-tracker/
├── core/
│   └── src/
│       ├── patterns/                    # 【新規】パターン分析（純粋ロジック）
│       │   ├── candlestick-pattern.ts   # 抽象基底クラス CandlestickPattern
│       │   ├── morning-star.ts          # 三川明けの明星（買いシグナル）
│       │   ├── evening-star.ts          # 三川宵の明星（売りシグナル）
│       │   ├── pattern-registry.ts      # 全パターン定義の静的レジストリ
│       │   └── pattern-analyzer.ts      # 全パターン一括実行サービス
│       ├── entities/
│       │   └── daily-summary.entity.ts  # 【変更】PatternResults 等フィールド追加
│       ├── mappers/
│       │   └── daily-summary.mapper.ts  # 【変更】新フィールドのマッピング追加
│       ├── repositories/
│       │   └── daily-summary.repository.interface.ts  # 変更なし
│       └── types.ts                     # 【変更】PatternStatus, PatternDefinition 等追加
├── web/
│   ├── app/
│   │   └── api/summaries/route.ts       # 【変更】パターン情報を含むレスポンス返却
│   ├── app/summaries/page.tsx           # 【変更】買い/売りカラム追加 + 詳細ダイアログ拡張
│   └── types/stock.ts                   # 【変更】TickerSummary にパターンフィールド追加
└── batch/
    └── src/summary.ts                   # 【変更】50本日足取得 + パターン分析 + upsert
```

**構成の決定**: 既存の `core + web + batch` 構成を拡張。新規ディレクトリは `core/src/patterns/` のみ追加。DailySummary エンティティにパターン結果フィールドを統合することで、DynamoDB への追加読み書きを最小化する。

## 複雑性の追跡

> **憲法チェックに違反があり正当化が必要な場合のみ記入**

違反なし。既存構成の範囲内で実装可能。
