# StockTracerのパターン分析に赤三兵思案星を追加する

## 概要

StockTracer のテクニカル分析に、売りパターンとして「赤三兵思案星」を追加する。

## 関連情報

- タスクタイプ: ライブラリタスク（@nagiyu/stock-tracker-core）

## 要件

### 機能要件

- FR1: `@nagiyu/stock-tracker-core` のパターン分析に赤三兵思案星を売りシグナルとして追加する
- FR2: 赤三兵思案星は3本のローソク足データで判定する
    - c2（最古）: 大きな陽線（実体 > レンジの30%）
    - c1（中間）: 大きな陽線（実体 > レンジの30%）、c2終値以下で始まりc2終値より高く終わる
    - c0（最新）: 小さな実体（実体 ≤ レンジの10%）で、c1の実体内で始まる（思案星）
- FR3: データが3本未満の場合は `INSUFFICIENT_DATA` を返す
- FR4: `PATTERN_REGISTRY` に登録し、パターン分析の自動集計対象とする

### 非機能要件

- NFR1: 既存パターン（三川明けの明星・三川宵の明星）と同一の設計パターンに従う
- NFR2: テストカバレッジ80%以上を維持する
- NFR3: TypeScript strict mode に準拠する

## 実装方針

- `CandlestickPattern` 抽象基底クラスを継承した `RedThreeSoldiersHesitation` クラスを作成する
- `patternId`: `red-three-soldiers-hesitation`
- `signalType`: `SELL`
- `PATTERN_REGISTRY` に登録して既存の集計ロジックに組み込む

## タスク

- [x] T001: `red-three-soldiers-hesitation.ts` パターンクラスを作成する
- [x] T002: `pattern-registry.ts` に新パターンを登録する
- [x] T003: `red-three-soldiers-hesitation.test.ts` テストファイルを作成する
- [x] T004: `pattern-analyzer.test.ts` を新パターン対応に更新する
- [x] T005: `daily-summary.mapper.test.ts` を新パターン対応に更新する

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `services/stock-tracker/core/src/patterns/` - 既存パターン実装
