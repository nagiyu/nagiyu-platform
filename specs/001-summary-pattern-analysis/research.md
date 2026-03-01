# 調査結果: Stock Tracker サマリー日足パターン分析

**ブランチ**: `001-summary-pattern-analysis` | **フェーズ**: Phase 0 調査出力

---

## 1. キャンドルスティックパターンアーキテクチャ（基底クラス設計）

### 決定事項

**抽象基底クラス `CandlestickPattern` を `core/src/patterns/` に導入し、各パターンはそのサブクラスとして実装する。**

```
core/src/patterns/
├── candlestick-pattern.ts   # abstract class CandlestickPattern
├── morning-star.ts          # class MorningStar extends CandlestickPattern
├── evening-star.ts          # class EveningStar extends CandlestickPattern
├── pattern-registry.ts      # PATTERN_REGISTRY: readonly CandlestickPattern[]
└── pattern-analyzer.ts      # class PatternAnalyzer（全パターン一括実行）
```

**抽象基底クラスの構造:**

```typescript
export abstract class CandlestickPattern {
  public abstract readonly definition: PatternDefinition;
  public abstract analyze(candles: ChartDataPoint[]): PatternStatus;
}
```

- `definition` は各パターンクラスが `readonly` フィールドとして保持（憲法 I: 「クラスプロパティはコンストラクタパラメータで定義してはならない（MUST NOT）。クラスボディに明示的に宣言すること」に準拠）
- `analyze()` は純粋関数として実装（副作用なし）
- `PatternStatus` は `'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA'` の union 型

### 根拠

- Issue の制約: 「パターンは将来拡張を見越して、標準化できる基底クラスを用意し、各パターンはそこから派生したクラスを用いるようにする」
- 将来の新パターン（例: 三川宵の十字星、包み足など）を `CandlestickPattern` を継承して追加するだけで、`PatternRegistry` と `PatternAnalyzer` の変更なしに機能拡張できる
- `PatternAnalyzer` は `CandlestickPattern[]` を受け取るため、オープン・クローズド原則に準拠

### 検討した代替案

| 代替案 | 却下理由 |
|--------|---------|
| 関数配列 `((candles) => PatternStatus)[]` | パターン定義（名前・説明・売買区分）と分析ロジックを一体化できない。型表現力が低い |
| StrategyパターンをInterface で実現 | TypeScript の abstract class でほぼ同等の表現力があり、`definition` フィールドの必須化が自然にできる |
| パターンをJSON設定ファイルで管理 | 分析ロジック自体はコードであり、JSON化に馴染まない。FR-003（ユーザー編集不可）とも一致するが、実装が複雑になる |

---

## 2. DynamoDB スキーマ設計（パターン分析結果の保存方法）

### 決定事項

**既存の `DailySummary` DynamoDB アイテムにパターン結果フィールドを拡張して統合する（同一 PK/SK に追記）。**

既存キー構造を維持:
- `PK: SUMMARY#{TickerID}`
- `SK: DATE#{date}`

追加フィールド:
```
PatternResults: { [patternId: string]: PatternStatus }   // 例: { "morning-star": "MATCHED", "evening-star": "NOT_MATCHED" }
BuyPatternCount: number                                   // 買いシグナル合致数
SellPatternCount: number                                  // 売りシグナル合致数
```

### 根拠

- 既存の `DailySummaryRepository.upsert()` を活用でき、新規リポジトリ・新規 GSI の追加が不要
- サマリー API（`GET /api/summaries`）は既に `getByExchange()` で DailySummary を一括取得しているため、パターン情報を同一アイテムに格納することで追加読み取りコストゼロ
- スキーマ変更は後方互換（フィールドが存在しない既存アイテムは `undefined` → フロントエンドで `??` でデフォルト 0 に対応）

### 検討した代替案

| 代替案 | 却下理由 |
|--------|---------|
| 別 SK のアイテムとして保存 (`PATTERN#DATE#{date}`) | 同じティッカー日付で2アイテムが存在し、GSI 設計・クエリが複雑化する。読み取り2回必要 |
| 別テーブルまたは別エンティティを新規作成 | サービスで1テーブル管理のシングルテーブル設計の方針に反する。インフラ変更コストが高い |

---

## 3. パターン分析アルゴリズム（三川パターン判定ロジック）

### 決定事項

**過去 50 本の日足データを降順（新→旧）で渡し、最新3本（index 0, 1, 2）を使用して判定する。**

#### 三川明けの明星（Morning Star）- 買いシグナル

```
前提: candles.length >= 3
  candles[2] (3日前): 陰線（close < open）かつ実体が大きい
  candles[1] (2日前): 実体が小さい（コマ足・十字線）。始値・終値ともに candles[2] の終値より低い
  candles[0] (1日前/最新): 陽線（close > open）かつ実体が大きい。終値が candles[2] の実体の中心より上
判定不能条件: candles.length < 3
```

#### 三川宵の明星（Evening Star）- 売りシグナル

```
前提: candles.length >= 3
  candles[2] (3日前): 陽線（close > open）かつ実体が大きい
  candles[1] (2日前): 実体が小さい（コマ足・十字線）。始値・終値ともに candles[2] の終値より高い
  candles[0] (1日前/最新): 陰線（close < open）かつ実体が大きい。終値が candles[2] の実体の中心より下
判定不能条件: candles.length < 3
```

**「実体が大きい」の定義**: `|close - open| > |high - low| * 0.3`（ヒゲを含む全値幅の30%超・スティーブ・ニソンの定義に基づく業界標準値）
**「実体が小さい」の定義**: `|close - open| <= |high - low| * 0.1`（全値幅の10%以下・十字線・コマ足の一般的定義に基づく業界標準値）

### 根拠

- 標準的なテクニカル分析の三川パターン定義に基づく
- 閾値（0.3、0.1）はパラメータとして将来調整可能にする（`protected` 定数として基底クラスに定義）
- **閾値の選択根拠**:
  - `0.3`（大きい実体の下限）: テクニカル分析の一般的な指針として、実体がヒゲを含む全値幅の 30% 超であれば「方向性のある相場」と判断できる（スティーブ・ニソンの定義に基づく経験則）。バックテストによる最適化は初版スコープ外だが、過度に厳しい条件（50%超など）にすると成立件数がほぼゼロになる懸念がある
  - `0.1`（小さい実体の上限）: 十字線・コマ足の一般的定義として、全値幅の 10% 以下であれば「迷い（不確実性）を示すローソク足」として解釈できる（業界標準に近い値）。将来 `protected readonly BODY_SMALL_THRESHOLD = 0.1` として各パターンクラスで上書き可能にする設計
- データが 3 本未満の場合は `'INSUFFICIENT_DATA'` を返すことで FR-007（判定不能の区別）を満たす

### 参考文献

- スティーブ・ニソン「ローソク足チャートの真実」（三川パターンの古典的定義）
- Investopedia: Morning Star / Evening Star candlestick pattern definitions

---

## 4. バッチ処理における日足データ取得

### 決定事項

**既存の `getChartData(tickerId, 'D', { count: 50, session: 'extended' })` を呼び出し、最大 50 本の日足データを取得する。**

- 既存の summary バッチはチャートデータを `count: 1` で取得していたが、パターン分析用に `count: 50` で再取得する
- 取得した 50 本を `PatternAnalyzer.analyze()` に渡し、結果を `DailySummary.upsert()` で既存サマリーアイテムに統合保存する

### 根拠

- 既存の TradingView クライアント（`getChartData`）は既に `count` パラメータをサポート
- OHLC1本取得とパターン分析用50本取得を同一 API 呼び出しで統合するより、用途を分けて呼び出す方が可読性が高い（1本は最新価格用、50本はパターン用）

### 検討した代替案

| 代替案 | 却下理由 |
|--------|---------|
| OHLC取得と兼ねて count: 50 に統一 | 全バッチで余分な 49 本を取得することになり、TradingView API 呼び出しコストが増える |
| DailySummary の過去履歴を DB から取得 | DailySummary テーブルに格納済みのデータを使えばTradingView呼び出しを追加しないで済む利点はあるが、データ鮮度と実装複雑性のトレードオフがある。今回は TradingView から直接取得するシンプルなアプローチを採用 |

---

## 5. フロントエンド UI 設計

### 決定事項

**一覧テーブル: 「買いシグナル」「売りシグナル」カラムを追加（数値表示）**
**詳細ダイアログ: 既存ダイアログに「パターン分析」セクションを追加。各パターンの ✓/✗ とツールチップで説明表示**

- `PatternStatus: 'MATCHED'` → ✓（緑）  
- `PatternStatus: 'NOT_MATCHED'` → ✗（グレー）  
- `PatternStatus: 'INSUFFICIENT_DATA'` → —（グレー、ツールチップ「データ不足」）
- ツールチップは MUI の `<Tooltip>` コンポーネントを使用（既存コンポーネントと統一）

### 根拠

- 既存の summaries/page.tsx は既に MUI `<Dialog>` を使用してティッカー詳細を表示している
- `TickerSummary` 型に `buyPatternCount`, `sellPatternCount`, `patternDetails` を追加するだけでフロントエンドへのデータ受け渡しが完結する

---

## 6. パターン定義の管理方式

### 決定事項

**パターン定義はシステム固定値として `PatternRegistry`（静的配列）で管理し、DynamoDB への保存は行わない。**

```typescript
export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
];
```

### 根拠

- FR-003: ユーザーが追加・編集・削除できない
- パターン定義（名称・説明・売買区分）を DynamoDB に保存しても、読み取りコストが増えるだけで可変データではない
- 新パターン追加時は `PATTERN_REGISTRY` にクラスインスタンスを追加するだけでよく、DB スキーマ変更不要
