# サマリーのテクニカルパターン追加

## 概要

サマリー機能のテクニカルパターン分析（`services/stock-tracker/core`）に、新たに 8 種類のチャートパターンを追加する。

既存の `CandlestickPattern` 基底クラスを継承し、`PATTERN_REGISTRY` に登録することで、バッチ処理・Web 表示に自動的に反映される設計となっている。

## 関連情報

- タスクタイプ: サービスタスク（stock-tracker/core, batch）

## 追加パターン一覧

| パターン名 | 英名（patternId 案） | シグナル |
|-----------|-------------------|---------|
| アセンディング・トライアングル | `ascending-triangle` | BUY |
| ベアコラッグ ※要確認 | `bear-flag`（※後述） | SELL |
| ブルフラッグ | `bull-flag` | BUY |
| ダブルトップ | `double-top` | SELL |
| 逆三尊 | `inverse-head-and-shoulders` | BUY |
| 切り上げダブルボトム | `rising-double-bottom` | BUY |
| 上昇ウェッジ | `rising-wedge` | SELL |
| 三尊 | `head-and-shoulders` | SELL |

> **⚠️ 「ベアコラッグ」の定義確認が必須**: 「ベアコラッグ」は標準的なチャートパターン用語として確立されていない。「ベアフラッグ（Bear Flag）」の誤記・別名の可能性が高いため、**実装開始前に必ず要件オーナーへ確認すること**。本ドキュメントでは仮に `bear-flag` を patternId として採用しているが、確認結果に応じてファイル名・patternId・クラス名・テストファイル名を一括変更すること。

## 要件

### 機能要件

- **FR1**: 8 種類のパターンクラスを `core/src/patterns/` 配下に新規作成する
- **FR2**: 各パターンクラスは `CandlestickPattern` 抽象クラスを継承し、`definition` と `analyze()` を実装する
- **FR3**: 各パターンクラスを `PATTERN_REGISTRY` に登録する
- **FR4**: 各パターンクラスを `core/src/index.ts` からエクスポートする
- **FR5**: `analyze()` は `ChartDataPoint[]`（新しい順: index 0 が最新）を受け取り、`PatternStatus`（`MATCHED` / `NOT_MATCHED` / `INSUFFICIENT_DATA`）を返す
- **FR6**: データ本数が判定に必要な最小本数未満の場合は `INSUFFICIENT_DATA` を返す
- **FR7**: 各パターンの単体テストを `core/tests/unit/patterns/` 配下に新規作成する

### 非機能要件

- **NFR1**: TypeScript strict mode を維持する
- **NFR2**: テストカバレッジ 80% 以上を維持する
- **NFR3**: 各パターンクラスは他のパターンクラスへの依存を持たない（単体で完結する）
- **NFR4**: バッチは既存の 50 本取得（`count: 50`）の範囲内で判定可能とする

## 実装方針

### アーキテクチャ

既存のパターン実装と同じ構造を踏襲する。

```
core/src/patterns/
    candlestick-pattern.ts      ← 変更なし（基底クラス）
    pattern-registry.ts         ← 変更あり（8 パターンを追加登録）
    pattern-analyzer.ts         ← 変更なし
    morning-star.ts             ← 既存
    evening-star.ts             ← 既存
    three-white-soldiers.ts     ← 既存
    red-three-soldiers-hesitation.ts ← 既存
    ascending-triangle.ts       ← 新規
    bear-flag.ts               ← 新規
    bull-flag.ts                ← 新規
    double-top.ts               ← 新規
    inverse-head-and-shoulders.ts ← 新規
    rising-double-bottom.ts     ← 新規
    rising-wedge.ts             ← 新規
    head-and-shoulders.ts       ← 新規
```

### パターン定義の概念

既存パターン（三川明けの明星など）はローソク足 3 本で判定するシンプルなキャンドルスティックパターンである。今回追加するパターンはより多くの本数（概ね 10〜30 本程度）を必要とするチャートパターンであるため、アルゴリズムの複雑度が高くなる点に注意する。

各パターンは `CandlestickPattern` インターフェースに準拠しつつ、内部に判定ロジックを実装する。

#### アセンディング・トライアングル（ascending-triangle）

- **概念**: 水平な抵抗線（高値が概ね一定）と右肩上がりのサポートライン（安値が切り上がり）が収束する三角形形成。ブレイクアウトが買いシグナル
- **必要本数**: 15 本程度を目安
- **判定要素**: 複数の高値ピークが近似水平、複数の安値が切り上がり、収束方向への確認

#### ベアコラッグ（bear-flag）※要確認

- **概念**: 下降トレンドの途中で短期的に横ばい〜わずかな上昇となった後、再び下降するパターン。売りシグナル（ベアフラッグに相当する可能性が高い）
- **必要本数**: 10〜15 本程度
- **判定要素**: 前段の下降トレンド確認、狭いレンジでの横ばい、レンジ下限ブレイク
- **⚠️ 注意**: 要件オーナーへの確認後、`patternId`・ファイル名・クラス名を確定すること

#### ブルフラッグ（bull-flag）

- **概念**: 急騰（フラッグポール）の後、平行または緩やかな下降チャネル（フラッグ）を形成し、上方ブレイクアウトで買いシグナル
- **必要本数**: 10〜15 本程度
- **判定要素**: 前段の急騰確認、フラッグの上限・下限の平行チャネル、上方ブレイク

#### ダブルトップ（double-top）

- **概念**: ほぼ同水準で 2 つの高値ピーク（M 字型）を形成し、ネックライン（谷）を下抜けで売りシグナル
- **必要本数**: 20〜30 本程度
- **判定要素**: 2 つのピークの高さが近似、ネックラインの特定、ネックライン下抜け

#### 逆三尊（inverse-head-and-shoulders）

- **概念**: 3 つの安値谷（左肩・頭・右肩）を持ち、中央の谷が最も深い W 字亜種。ネックラインを上抜けで買いシグナル
- **必要本数**: 25〜35 本程度
- **判定要素**: 3 谷の位置関係（頭が最も低い）、左右の肩の対称性（概ね近似）、ネックライン上抜け

#### 切り上げダブルボトム（rising-double-bottom）

- **概念**: 2 つの安値が切り上がって形成されるダブルボトム（通常のダブルボトムよりも強気）。2 つ目の底が 1 つ目より高いことが特徴。買いシグナル
- **必要本数**: 15〜25 本程度
- **判定要素**: 2 つの安値谷の特定、2 つ目の谷が 1 つ目より高い、ネックライン上抜けまたは直近高値超え

#### 上昇ウェッジ（rising-wedge）

- **概念**: 高値・安値ともに右肩上がりだが、収束幅が狭まるパターン。上昇の勢いが衰えており、下方ブレイクで売りシグナル
- **必要本数**: 15〜20 本程度
- **判定要素**: 高値のトレンドラインと安値のトレンドラインがともに右肩上がりかつ収束、下限ブレイク

#### 三尊（head-and-shoulders）

- **概念**: 3 つの高値ピーク（左肩・頭・右肩）を持ち、中央が最も高い M 字亜種。ネックラインを下抜けで売りシグナル
- **必要本数**: 25〜35 本程度
- **判定要素**: 3 ピークの位置関係（頭が最も高い）、左右の肩の対称性（概ね近似）、ネックライン下抜け

### 実装上の留意点

- 新パターンはすべて多数のローソク足データを使用するため、局所的な極値（スウィング高値・安値）の検出ロジックが共通して必要になる
- 「極値の近似判定」（2 つの高値・安値が"同程度"とみなす閾値）はパターンクラスの `private static readonly` 定数として保持する
- 極値検出の汎用ロジックが複数クラスで重複する場合、`core/src/patterns/` 配下にユーティリティ関数として切り出すことを検討する（ただし分離が不要な場合は各クラス内に実装しても構わない）
- バッチが取得する日足データは最大 50 本。各パターンの `INSUFFICIENT_DATA` 判定の閾値はこの制約に収まるよう設定する

## タスク

### Phase 1: パターンクラスの作成

- [ ] T001: `ascending-triangle.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/ascending-triangle.ts`
- [ ] T002: `bear-flag.ts` を新規作成する（事前に ベアコラッグ の定義を確認すること）
    - ファイル: `services/stock-tracker/core/src/patterns/bear-flag.ts`
- [ ] T003: `bull-flag.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/bull-flag.ts`
- [ ] T004: `double-top.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/double-top.ts`
- [ ] T005: `inverse-head-and-shoulders.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/inverse-head-and-shoulders.ts`
- [ ] T006: `rising-double-bottom.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/rising-double-bottom.ts`
- [ ] T007: `rising-wedge.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/rising-wedge.ts`
- [ ] T008: `head-and-shoulders.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/src/patterns/head-and-shoulders.ts`

### Phase 2: レジストリ・エクスポートの更新

- [ ] T009: `PATTERN_REGISTRY` に 8 パターンを追加する
    - ファイル: `services/stock-tracker/core/src/patterns/pattern-registry.ts`
- [ ] T010: `core/src/index.ts` に 8 パターンクラスのエクスポートを追加する
    - ファイル: `services/stock-tracker/core/src/index.ts`

### Phase 3: テスト作成

- [ ] T011: `ascending-triangle.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/ascending-triangle.test.ts`
    - MATCHED / NOT_MATCHED / INSUFFICIENT_DATA の各ケースを網羅する
- [ ] T012: `bear-flag.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/bear-flag.test.ts`
- [ ] T013: `bull-flag.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/bull-flag.test.ts`
- [ ] T014: `double-top.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/double-top.test.ts`
- [ ] T015: `inverse-head-and-shoulders.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/inverse-head-and-shoulders.test.ts`
- [ ] T016: `rising-double-bottom.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/rising-double-bottom.test.ts`
- [ ] T017: `rising-wedge.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/rising-wedge.test.ts`
- [ ] T018: `head-and-shoulders.test.ts` を新規作成する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/head-and-shoulders.test.ts`
- [ ] T019: `pattern-analyzer.test.ts` を更新し、新パターンの COUNT が正しく加算されることを確認するテストを追加する
    - ファイル: `services/stock-tracker/core/tests/unit/patterns/pattern-analyzer.test.ts`

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- テスト戦略: `docs/development/testing.md`

## 影響範囲

| ファイル | 変更種別 |
|--------|---------|
| `services/stock-tracker/core/src/patterns/ascending-triangle.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/bear-flag.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/bull-flag.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/double-top.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/inverse-head-and-shoulders.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/rising-double-bottom.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/rising-wedge.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/head-and-shoulders.ts` | 新規 |
| `services/stock-tracker/core/src/patterns/pattern-registry.ts` | 変更 |
| `services/stock-tracker/core/src/index.ts` | 変更 |
| `services/stock-tracker/core/tests/unit/patterns/*.test.ts` | 新規（8 ファイル）|
| `services/stock-tracker/core/tests/unit/patterns/pattern-analyzer.test.ts` | 変更 |

> **注意**: `batch/src/summary.ts`・Web アプリ・`DailySummaryMapper` は `PATTERN_REGISTRY` を動的に参照する設計のため、変更不要。

## 備考・未決定事項

- **ベアコラッグの定義確認**: 「ベアコラッグ」は一般的なチャートパターン用語として定着していないため、「ベアフラッグ（Bear Flag）」の誤記・別名の可能性を含め、実装前に要件オーナーへ確認することを推奨する。確認後、`patternId` とクラス名を最終決定する
- **判定アルゴリズムの精度**: 今回追加するパターンはすべて複数スウィングを必要とするチャートパターンであり、判定アルゴリズムの実装難度が既存パターンより高い。フォールスポジティブ（誤検知）を抑えるため、各閾値は保守的に設定することを推奨する
- **極値検出ユーティリティ**: 複数パターンで局所的な高値・安値を検出するロジックが共通化できる場合、`core/src/patterns/pattern-utils.ts` 等にユーティリティ関数を切り出すことで保守性が向上する
- **バッチのチャートデータ取得本数**: 現状 50 本取得しているが、三尊・逆三尊などの複雑なパターンは 50 本では不足する場合がある。必要に応じてバッチの取得本数見直しも検討すること
