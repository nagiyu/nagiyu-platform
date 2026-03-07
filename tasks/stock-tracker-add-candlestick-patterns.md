# Stock Tracker テクニカル分析パターン追加

## 概要

Stock Tracker のサマリー画面で表示するローソク足テクニカル分析パターンを追加する。
買いシグナル 5 パターン・売りシグナル 9 パターンの計 14 パターンを新規実装し、`PATTERN_REGISTRY` に登録する。

---

## 関連情報

- タスクタイプ: サービスタスク（Stock Tracker / core）
- 対象ディレクトリ: `services/stock-tracker/core/src/patterns/`
- テスト対象: `services/stock-tracker/core/tests/unit/patterns/`
- 関連ドキュメント:
    - `docs/services/stock-tracker/architecture.md`
    - `docs/development/rules.md`

---

## パターン実装可否の判定結果

### 実装するパターン（BUY: 5 パターン）

| patternId | 日本語名 | 英語名（参考） | 必要本数 | 判定根拠 |
|-----------|---------|--------------|---------|---------|
| `tweezer-bottom` | 二本たくり線 | Tweezer Bottom | 2 | 国際的に認知されたパターン。実装可能。 |
| `rising-three-methods` | 上げ三法 | Rising Three Methods | 5 | 国際的に認知されたパターン。実装可能。 |
| `three-gaps-hammering` | 三空叩き込み | Three Gap Hammering | 4 | 3 連続ギャップダウン後の過売り反転。実装可能。 |
| `bullish-engulfing` | 陽のつつみ線 | Bullish Engulfing | 2 | 国際的に認知されたパターン。実装可能。 |
| `harami-cross-buy` | 抱きの一本立ち | Bullish Harami Cross | 2 | はらみの特殊形（十字線）。実装可能。 |

### 実装するパターン（SELL: 9 パターン）

| patternId | 日本語名 | 英語名（参考） | 必要本数 | 判定根拠 |
|-----------|---------|--------------|---------|---------|
| `shooting-star` | 流れ星 | Shooting Star | 1 | 国際的に認知されたパターン。「仕掛け花火」と統合。 |
| `hanging-man` | 首吊り線 | Hanging Man | 1 | 国際的に認知されたパターン。実装可能。 |
| `falling-three-methods` | 下げ三法 | Falling Three Methods | 5 | 既存の「上げ三法」の売り版。実装可能。 |
| `three-black-crows` | 黒三兵 | Three Black Crows | 3 | 既存の `three-white-soldiers` の売り版。実装可能。 |
| `doji-star` | 星 | Doji Star | 2 | 国際的に認知されたパターン。実装可能。 |
| `bearish-harami` | はらみ | Bearish Harami | 2 | 上昇後の大陽線内に小陰線。実装可能。 |
| `bearish-engulfing` | つつみ | Bearish Engulfing | 2 | 大陰線が前の陽線を包む。実装可能。 |
| `three-black-crows-gaps` | 陰の三つ星 | Three Black Crows with Gaps | 3 | ギャップを伴う 3 連続陰線。`three-black-crows` とは別パターン。実装可能。 |
| `bullish-harami-top` | 陽の両はらみ | Bullish Harami (Reversal) | 2 | 高値圏で大陰線内に陽線が収まる反転シグナル。実装可能。 |

### スキップするパターン

| 日本語名 | スキップ理由 |
|---------|------------|
| つばめ返し | 定義が曖昧かつ「陽のつつみ線」（Bullish Engulfing）と実質的に重複する可能性が高い |
| 岡時三羽 | 日本特有で国際的な文献に判定基準が見当たらない |
| 小石崩れ | 日本特有で国際的な文献に判定基準が見当たらない |
| 鷹かえし | 日本特有で国際的な文献に判定基準が見当たらない |
| 仕掛け花火 | 「流れ星」（Shooting Star）と同一パターンのため、`shooting-star` として実装される（統合）。 |

### 保留パターン（実装見送り・要確認）

| 日本語名 | 保留理由 |
|---------|--------|
| 陰の両つつみ | Issue では BUY カテゴリーに記載されているが、一般的には Bearish Engulfing として SELL シグナルとして使用される。シグナル区分を確認後に実装を検討すること。 |

---

## パターン判定ロジックの概要

実装時に各パターンの `analyze()` で使用する判定ロジックの概念を示す。
具体的な閾値（`LARGE_BODY_THRESHOLD` 等）は既存パターンに揃えること。

> **重要**: `candles[0]` が最新（当日）、`candles[N-1]` が最古のデータ。インデックスの向きに注意すること。

### BUY パターン

#### `tweezer-bottom`（二本たくり線）

- `candles[0]`・`candles[1]` の 2 本の安値（`low`）がほぼ等しい（許容誤差: 価格幅の数%）
- 下降トレンドの底付近での出現を前提に判定
- どちらの足も実体を持つこと（ドージでないこと）

#### `rising-three-methods`（上げ三法）

- `candles[4]`（最古）: 大陽線（実体が価格幅の一定割合以上）
- `candles[3]`, `candles[2]`, `candles[1]`: 3 本連続の小陰線。それぞれの実体が `candles[4]` の実体内に収まる
- `candles[0]`（最新）: 大陽線。終値が `candles[4]` の終値を上回る

#### `three-gaps-hammering`（三空叩き込み）

- `candles[3]`, `candles[2]`, `candles[1]` の 3 本が連続陰線
- 各足間にギャップダウン（前の足の安値 > 次の足の高値）が存在する
- 3 回連続のギャップダウンは過売りを示し、反転シグナルとして BUY

#### `bullish-engulfing`（陽のつつみ線）

- `candles[1]`（前の足）: 陰線
- `candles[0]`（最新）: 陽線で、実体が `candles[1]` の実体を完全に包む（open < `c1.close`、close > `c1.open`）

#### `harami-cross-buy`（抱きの一本立ち）

- `candles[1]`: 大きな陰線（実体が価格幅の一定割合以上）
- `candles[0]`: 十字線（実体がほぼゼロ、`DOJI_THRESHOLD` 以下）、かつ実体が `candles[1]` の実体内に収まる

---

### SELL パターン

#### `shooting-star`（流れ星）

> 「仕掛け花火」は「流れ星（Shooting Star）」と同一の形状・判定条件であるため、`shooting-star` として統合する。

- 上影線の長さが実体の 2 倍以上
- 実体が価格幅の下部に位置する（小さな実体）
- 下影線がほぼない（下影線 ≤ 実体の 10% 程度）

#### `hanging-man`（首吊り線）

- 下影線の長さが実体の 2 倍以上
- 実体が価格幅の上部に位置する（小さな実体）
- 上影線がほぼない（上影線 ≤ 実体の 10% 程度）
- `shooting-star` と形状は対称だが、判定方向（下影線 vs 上影線）が異なる

#### `falling-three-methods`（下げ三法）

- `candles[4]`（最古）: 大陰線
- `candles[3]`, `candles[2]`, `candles[1]`: 3 本連続の小陽線。それぞれの実体が `candles[4]` の実体内に収まる
- `candles[0]`（最新）: 大陰線。終値が `candles[4]` の終値を下回る
- 既存の `rising-three-methods` の売り版として実装

#### `three-black-crows`（黒三兵）

- 3 本連続の大陰線
- 各足の始値が前の足の実体内（open > `c_prev.close`、open < `c_prev.open`）
- 各足の終値が前の足の終値を下回る
- 既存の `three-white-soldiers` の売り版として実装

#### `doji-star`（星）

- `candles[1]`: 大陽線（実体が価格幅の一定割合以上）
- `candles[0]`: 十字線（実体がほぼゼロ）。終値と始値の差が価格幅の `DOJI_THRESHOLD` 以下
- 上昇後の高値圏で出現する転換シグナル

#### `bearish-harami`（はらみ）

- `candles[1]`: 大陽線（実体が価格幅の一定割合以上）
- `candles[0]`: 実体が `candles[1]` の実体内に収まる（`c1.open < min(open, close)` かつ `max(open, close) < c1.close`）
- 実体が小さいほど転換シグナルとして強い

#### `bearish-engulfing`（つつみ）

- `candles[1]`: 陽線
- `candles[0]`: 陰線で、実体が `candles[1]` の実体を完全に包む（open > `c1.close`、close < `c1.open`）
- `bullish-engulfing` の売り版として実装

#### `three-black-crows-gaps`（陰の三つ星）

- `candles[2]`, `candles[1]`, `candles[0]` の 3 本が連続陰線
- 各足の始値が前の足の終値よりも低い（ギャップダウンで始まる）
- `three-black-crows` との差異: ギャップの有無

#### `bullish-harami-top`（陽の両はらみ）

- `candles[1]`: 大陰線（`c1.open > c1.close` かつ実体が価格幅の一定割合以上）
- `candles[0]`: 陽線（`open < close`）で、実体が `candles[1]` の実体内に収まる（`c1.close < open < close < c1.open`）
- 高値圏での反転シグナルとして SELL

---

## 要件

### 機能要件

- FR1: 各パターンが `CandlestickPattern` を継承し、`definition` と `analyze()` を実装すること
- FR2: `analyze()` はデータ不足時に `INSUFFICIENT_DATA` を返すこと（`candles.length` がパターンの最低必要本数未満の場合）
- FR3: 全パターンが `PATTERN_REGISTRY` に登録されること
- FR4: 各パターンのユニットテストが `tests/unit/patterns/` 配下に作成されること
- FR5: 各テストが MATCHED / NOT_MATCHED / INSUFFICIENT_DATA の 3 ケース以上をカバーすること

### 非機能要件

- NFR1: TypeScript strict mode 準拠（`tsconfig.json` の `strict: true` を満たすこと）
- NFR2: テストカバレッジ 80% 以上（ビジネスロジック中心）
- NFR3: 既存パターンの閾値定数（`LARGE_BODY_THRESHOLD` 等）の命名規則・スタイルに準拠すること
- NFR4: `description` フィールドは日本語で記述すること

---

## 実装タスク

### Phase 1: BUY パターンの実装（5 パターン）

- [ ] T001: `services/stock-tracker/core/src/patterns/tweezer-bottom.ts` を作成する
    - [ ] `tests/unit/patterns/tweezer-bottom.test.ts` を作成する
- [ ] T002: `services/stock-tracker/core/src/patterns/rising-three-methods.ts` を作成する
    - [ ] `tests/unit/patterns/rising-three-methods.test.ts` を作成する
- [ ] T003: `services/stock-tracker/core/src/patterns/three-gaps-hammering.ts` を作成する
    - [ ] `tests/unit/patterns/three-gaps-hammering.test.ts` を作成する
- [ ] T004: `services/stock-tracker/core/src/patterns/bullish-engulfing.ts` を作成する
    - [ ] `tests/unit/patterns/bullish-engulfing.test.ts` を作成する
- [ ] T005: `services/stock-tracker/core/src/patterns/harami-cross-buy.ts` を作成する
    - [ ] `tests/unit/patterns/harami-cross-buy.test.ts` を作成する

### Phase 2: SELL パターンの実装（9 パターン）

- [ ] T006: `services/stock-tracker/core/src/patterns/shooting-star.ts` を作成する（流れ星・仕掛け花火を統合）
    - [ ] `tests/unit/patterns/shooting-star.test.ts` を作成する
- [ ] T007: `services/stock-tracker/core/src/patterns/hanging-man.ts` を作成する
    - [ ] `tests/unit/patterns/hanging-man.test.ts` を作成する
- [ ] T008: `services/stock-tracker/core/src/patterns/falling-three-methods.ts` を作成する
    - [ ] `tests/unit/patterns/falling-three-methods.test.ts` を作成する
- [ ] T009: `services/stock-tracker/core/src/patterns/three-black-crows.ts` を作成する
    - [ ] `tests/unit/patterns/three-black-crows.test.ts` を作成する
- [ ] T010: `services/stock-tracker/core/src/patterns/doji-star.ts` を作成する
    - [ ] `tests/unit/patterns/doji-star.test.ts` を作成する
- [ ] T011: `services/stock-tracker/core/src/patterns/bearish-harami.ts` を作成する
    - [ ] `tests/unit/patterns/bearish-harami.test.ts` を作成する
- [ ] T012: `services/stock-tracker/core/src/patterns/bearish-engulfing.ts` を作成する
    - [ ] `tests/unit/patterns/bearish-engulfing.test.ts` を作成する
- [ ] T013: `services/stock-tracker/core/src/patterns/three-black-crows-gaps.ts` を作成する
    - [ ] `tests/unit/patterns/three-black-crows-gaps.test.ts` を作成する
- [ ] T014: `services/stock-tracker/core/src/patterns/bullish-harami-top.ts` を作成する
    - [ ] `tests/unit/patterns/bullish-harami-top.test.ts` を作成する

### Phase 3: パターン登録・検証

- [ ] T015: `services/stock-tracker/core/src/patterns/pattern-registry.ts` に T001〜T014 の全パターンを追加する
    - import 文と `PATTERN_REGISTRY` 配列への追記
- [ ] T016: 全テストが通過することを確認する（`npm test` or 相当のコマンド）

---

## 実装時の注意事項

### インデックスの方向

`candles[0]` が最新（当日）、`candles[N-1]` が最古のデータ。
5 本パターン（上げ三法・下げ三法）の場合: `candles[4]` が最も古い足となる。

### 既存実装との対称性

以下の既存パターンとの実装対称性を意識すること:

| 新規パターン | 対称となる既存パターン |
|------------|---------------------|
| `falling-three-methods` | `rising-three-methods`（上げ三法）|
| `three-black-crows` | `three-white-soldiers`（赤三兵）|
| `bearish-engulfing` | `bullish-engulfing`（陽のつつみ線）|

### 閾値定数の扱い

- 各クラスで `private static readonly` 定数として定義する（既存実装に準拠）
- `LARGE_BODY_THRESHOLD = 0.3`（実体が価格幅の 30% 以上 → 大きな足）
- `SMALL_BODY_THRESHOLD = 0.1`（実体が価格幅の 10% 以下 → 小さな足）
- `DOJI_THRESHOLD`（十字線判定用）は `SMALL_BODY_THRESHOLD` を流用するか、別途定義する

### テストデータの作成

- 既存テストの `createCandle(open, high, low, close)` ヘルパーを参考に実装する
- 境界値テスト（閾値ちょうど）を含めること
- `INSUFFICIENT_DATA` のケースとして必要本数 - 1 本、1 本、0 本のテストを含めること

---

## 参考ドキュメント

- `docs/services/stock-tracker/architecture.md` - サービス全体のアーキテクチャ
- `docs/services/stock-tracker/testing.md` - テスト方針
- `docs/development/rules.md` - コーディング規約

---

## 備考・未決定事項

- **陰の両つつみの扱い**: Issue では BUY カテゴリーに分類されているが、一般的な Bearish Engulfing は SELL シグナルであるため、シグナル区分の意図を確認した上で実装可否を判断すること。
- **スキップパターンの再検討**: 「岡時三羽」「小石崩れ」「鷹かえし」「つばめ返し」については、日本語ローソク足分析の専門文献等で定義が確認できた場合は追加実装を検討してよい。
- **「陰の三つ星」と「黒三兵」の差別化**: `three-black-crows-gaps`（ギャップあり）と `three-black-crows`（ギャップなし）として区別して実装する。テスト時にギャップの有無で明確に結果が分岐することを確認すること。
