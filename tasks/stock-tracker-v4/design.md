# Stock Tracker v4.0.0 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/stock-tracker/architecture.md に ADR として抽出し、
    tasks/stock-tracker-v4/ ディレクトリごと削除します。

    入力: tasks/stock-tracker-v4/requirements.md, tasks/stock-tracker-v4/external-design.md
    実装タスクのフェーズ分け・進捗管理は Issue 本文 + サブ Issue で行います。
-->

本書は、要件で「設計で決める」とした事項と、実装の骨格を定める。コードを読めばわかることは書かない。

---

## 1. 確度の算出

<!-- TODO(分析結果待ち): 方式比較の結果と人の選択を反映する -->

### 1.1 問いと実績の定義

- **市場**: JP = TSE、US = NASDAQ・NYSE・AMEX（ADR-V4-01）。
- **翌営業日**: 同じ銘柄の、基準日より後で最初の DailySummary の日付。#3833 以降は休場日に DailySummary が作られないため、カレンダーを持たずに済む（採点の評価日と同じ考え方）。
- **Q-DIR の実績**: 翌営業日の終値リターン（基準日終値比）− 同日・同市場の有効銘柄の平均。> 0 なら的中。
- **Q-VOL の実績**: 翌営業日の値幅 (高値 − 安値) ÷ 基準日終値 が、その銘柄の平常を上回れば的中。
- **Q-MKT の実績**: 翌営業日の市場平均値幅が、市場の平常を上回れば的中。
- **平常**: 【分析待ち】直近 N 営業日（基準日を含む）の値幅の平均。N の比較結果で決める。
- **採点から除外するもの**（FR-14。#3830 の結果に揃える）
    - 翌営業日の |リターン| > 20%（株式分割またぎ等）。除外理由を実績に記録する。
    - 休場日コピー足・途中足は、#3833 以降はデータ自体が作られない。初期値算出（FR-13）で過去データを読むときだけ、#3830 の除外リスト（祝日の日付・前レコードと OHLC が同一・CreatedAt が翌営業日の取引開始以降）を適用する。

### 1.2 判断軸の初期セット

| 区分 | 軸 | 種類 | 値 |
|------|----|------|----|
| 単一パターン | 既存 27 パターン（買い 11・売り 16） | 点灯型 | PatternResults が MATCHED なら 1。INSUFFICIENT_DATA は 0 |
| 複合パターン | 買い合致数 ≥ 2、売り合致数 ≥ 2 | 点灯型 | BuyPatternCount / SellPatternCount から |
| 値動きの大きさ | 直近 5 日の値幅（Parkinson）、当日の値幅、出来高比 | 数値型 | 銘柄の平常で割った比（【分析待ち】変換） |
| 市場レベル（Q-MKT 用） | 上記大きさ軸の市場平均 | 数値型 | 市場の有効銘柄の平均 |

- 出来高が欠けている日は、出来高比の軸を「値なし」とし、合成に寄与させない。
- 軸は `core` のコードで定義する（軸 ID・名前・種類・対象の問い・算出関数）。DB には持たない。

### 1.3 軸と問いの対応（FR-5）

【分析待ち】対応を固定する案と、全軸を全問いで使う案の比較結果で決める。

### 1.4 合成方式

【分析待ち】候補 A〜D の比較結果を示し、人が選ぶ。決めること:

- 方式（縮小・相関の扱いを含む）
- 学習窓（拡張型 / 直近 N 日）と重みの更新頻度（日次 / 週次）
- 重みづけの単位（市場ごとに別の重みにするか、JP・US 共通にするか）
- 寄与の分解（外部設計の「寄与」表示。対数オッズの加算を pt に換算する方法）

### 1.5 基準値と中立帯

- **基準値**（FR-11）: その問い・市場の、予測日より前に採点済みの全件の的中率。
- **中立帯**（FR-11a）: 【分析待ち】判定方法の比較結果で決める。

### 1.6 稼働開始時の扱い

- 初期値算出（FR-13・§3.3）で、既存の DailySummary の履歴から、稼働開始日までの確度・採点・重みをさかのぼって作る。稼働初日から、溜まった成績で確度を出せる。

---

## 2. データ構造

### 2.1 方針

- **既存の DailySummary には書き込まない**。確度・採点・重みは別のアイテムとして持つ。
    - FR-24（AI 関連データを残す）と、NFR-2（確度が失敗してもサマリーは保存する）を両立しやすい。
    - DailySummary の `upsert` は PutItem による丸ごと上書きのため、同じアイテムに確度を載せると、サマリーの再判定で確度が消える。
- **予測時点の値は書き換えない**（FR-12）。確度アイテムの確率・基準値・中立帯・寄与は、算出時に一度だけ書く。採点結果は別の属性として後から追記する。
- **軸の値は Map で持つ**（NFR-7）。軸を追加しても既存アイテムの移行は不要。値がない軸は「値なし」として表示・集計から外す。

### 2.2 アイテム（単一テーブル `nagiyu-stock-tracker-main-{env}` に追加）

| Type | PK | SK | GSI4PK / GSI4SK | 内容 |
|------|----|----|----------------|------|
| `Forecast` | `FORECAST#{TickerID}` | `DATE#{Date}` | `FORECAST#{ExchangeID}` / `DATE#{Date}#{TickerID}` | 銘柄×日の軸の値・確度・寄与。採点結果（Outcome）を後から追記 |
| `MarketForecast` | `MARKETFORECAST#{Market}` | `DATE#{Date}` | — | 市場×日の市場レベル軸の値・Q-MKT の確度。採点結果を後から追記 |
| `ModelSnapshot` | `MODEL#{Question}#{Market}` | `DATE#{Date}` | — | その日の算出に使った重み・基準値・中立帯・確率帯ごとの過去実績・軸ごとの成績 |
| `PerformanceDaily` | `PERF#{Question}#{Market}` | `DATE#{Date}` | — | 予測日ごとの採点済み件数の集計（軸ごとの件数・的中数・超過リターン合計、確率帯ごとの件数・的中数）。SCR-007 の期間集計を日数分の合計で済ませるため |

- GSI4（ExchangeSummaryIndex）を Forecast でも使う（オーバーロード）。サマリー一覧 API は、同じ取引所・日付で DailySummary と Forecast を 1 回ずつ Query して結合する。
- GSI4PK に `FORECAST#` 接頭辞を付けるのは、dev-sync が DailySummary を `GSI4PK = NYSE` 等の完全一致で複製しているためでもある。Forecast は dev に複製されず、dev では dev のバッチが自前で算出する（§3.4）。

### 2.3 論理モデル（主要な属性）

```typescript
type Question = 'DIR' | 'VOL' | 'MKT';
type Market = 'JP' | 'US';

/** 問いごとの確度（予測時点の値。書き換えない） */
type ProbabilityRecord = {
  probability: number;          // 0〜1
  baseline: number;             // 基準値
  neutralBand: { lower: number; upper: number };
  bandHistory: { lower: number; upper: number; count: number; hitRate: number } | null; // 同じ確率帯の過去実績
  contributions: Record<AxisId, number>;  // 寄与（pt）。値なし・寄与ゼロの軸は省略可
  lowSampleAxes: AxisId[];      // 件数不足で重みがゼロ寄りの軸
};

type ForecastItem = {
  TickerID: string;
  ExchangeID: string;
  Market: Market;
  Date: string;                             // 基準日（YYYY-MM-DD）
  AxisValues: Record<AxisId, number | boolean>;  // 軸の値・点灯状態（予測時点）
  Normal: { range: number; volume?: number };    // 算出に使った平常
  Probabilities: Partial<Record<'DIR' | 'VOL', ProbabilityRecord>>;
  ModelVersion: string;                     // 算出ロジックの版（軸定義・方式の変更を追えるように）
  Outcome?: {
    NextDate: string;
    NextReturn: number;
    ExcessReturn: number;
    NextRange: number;
    RangeRatio: number;                     // 翌日値幅 ÷ 平常
    Hit: Partial<Record<'DIR' | 'VOL', boolean>>;
    ExcludedReason?: 'EXTREME_RETURN';
    EvaluatedAt: number;
  };
  CreatedAt: number;
  UpdatedAt: number;
};
```

- `MarketForecast` も同じ形（`AxisValues`・`Probabilities.MKT`・`Outcome`）。
- `ModelSnapshot` の中身（重みの表現）は §1.4 の方式で決まる。【分析待ち】
- 1 アイテムの大きさは軸 35 個程度で数 KB に収まる。

### 2.4 AI 撤去後の DailySummary の扱い（FR-24）

- 型から AI 関連の属性（`AiAnalysisResult` / `AiAnalysisError` / `Evaluation*`）を外しても、DynamoDB 上のデータは残す。
- **注意**: 現行の `upsert` は PutItem で丸ごと上書きする。型から AI 属性を外したまま再判定（新パターン追加時の `needsStaticAnalysis`）が走ると、既存アイテムの AI データが消えて FR-24 に反する。撤去と同時に、`upsert` を「サマリーが管理する属性だけを UpdateItem で更新する」形に変える。

---

## 3. バッチ構成

### 3.1 新しいバッチ: `forecast`

サマリー生成（`summary`）とは別の Lambda にする（NFR-2 障害分離）。1 回の実行で、市場ごとに次の 3 段を順に行う。いずれも冪等で、途中で落ちても次の実行で続きから進む。

1. **採点**: 基準日 D の DailySummary が揃ったら、前営業日の Forecast / MarketForecast に Outcome を追記し、PerformanceDaily を更新する。
2. **重みの更新**: D の時点で採点済みのデータだけから、重み・基準値・中立帯を算出し、ModelSnapshot(D) を書く。【分析待ち】更新頻度が週次なら、更新日以外は直近のスナップショットを引き継ぐ。
3. **確度の算出**: D の各銘柄の軸の値と確率を算出して Forecast(D) を書き、市場の MarketForecast(D) を書く。

**起動タイミング**

- `summary` と同じく毎時起動し、市場ごとに「対象日の DailySummary が揃ったか」を見て処理する。US は 3 取引所をまとめて 1 市場として扱う。
- 「揃った」の判定: 市場の有効ティッカー（直近 7 日以内に DailySummary がある銘柄）がすべて D のサマリーを持つか、翌営業日の取引開始が近づいた（打ち切り）場合。打ち切りで欠けた銘柄は確度なしとし、市場平均は揃った銘柄で計算する。
- `summary` の実行終了時に `forecast` を非同期で起動し、毎時の起動を待たずに済むようにする（NFR-1）。`/api/summaries/refresh` による手動生成でも同じ流れで走る。

**性能の見積もり**【分析待ち】

- 学習に使う過去サンプル数（137 銘柄 × 学習窓の日数）と方式の計算量で決まる。ロジスティック回帰程度なら、1 年分（約 3.4 万行 × 35 軸）でも 512MB / 数秒で収まる見込み。過去サンプルの読み出し（Forecast の Query）がボトルネックになる場合は、学習用データを S3 に日次で追記する案を検討する。

### 3.2 撤去するバッチ

- `evaluation`（AI 予測の採点）: Lambda・EventBridge ルールごと撤去する（FR-23）。
- `summary` の AI 解析部分（OpenAI 呼び出し・チャート画像生成）: 撤去する（FR-21）。

### 3.3 成績の初期値算出（FR-13）

- `forecast` と**同じコード**を、過去の日付を 1 日ずつ進めながら呼ぶ（リプレイ）。同じ関数が「その日までのデータ」しか受け取らないので、将来データは構造的に混ざらない（§4）。
- 手動起動の Lambda（またはローカル実行スクリプト）とし、稼働開始時に 1 回実行する。既存の DailySummary は読むだけ。
- **判断軸の追加時（FR-4）**: 新しい軸の値を、過去の Forecast の `AxisValues` に**追記だけ**する（既存のキー・確率・寄与は書き換えない）。これで過去データから新しい軸の成績を算出できる。表示済みの確率は変わらないので FR-12 と両立する。

### 3.4 dev 環境

- dev では `summary`・`evaluation` が停止している（dev-sync との二重実行を避けるため）。`forecast` は Forecast 系のアイテムにしか書かず、dev-sync が複製しない範囲なので、**dev でも有効にする**。dev-sync が複製した DailySummary から、dev の `forecast` が確度を算出する。
- これにより dev で確度の画面とバッチを検証できる。外部 API を呼ばず、同じ入力から同じ結果が出る（NFR-3）ため、prod との差は入力データの差だけになる。

---

## 4. 将来データ混入を防ぐテスト方針（NFR-4）

- **構造**: 算出の中核は、純粋関数 `computeForDate(history, D)` にする。`history` は D 以前の OHLCV・パターンと、D の引けまでに採点が確定した Outcome だけを含む。DB アクセスは呼び出し側（バッチ）に閉じる。
- **切り詰め不変性テスト**: 同じ D について、「全期間のデータを渡した場合」と「D より後を切り落としたデータを渡した場合」で出力が完全に一致することを検証する。将来のデータを 1 件でも参照していれば差が出る。フィクスチャの全日付で回す。
- **アクセス監視テスト**: `history` をラップし、D より後の日付・D 以降の予測日の Outcome にアクセスしたら例外を投げる。
- **再現性テスト**（NFR-3）: 同じ入力で 2 回実行し、完全一致を確認する（乱数は使わない。使う場合はシードを固定する）。
- **参照実装との突き合わせ**: Phase 2 の分析スクリプト（Python）の出力を、小さなフィクスチャでゴールデン値として取り込み、TypeScript 実装と許容誤差内で一致することを確認する。
- **除外ルール**: #3830 の除外（極端リターン等）と、休場日にサマリーがない場合の「翌営業日」の決め方をテストする。

---

## 5. AI 撤去の段取り（FR-21〜FR-25）

- 着手条件の #3778 は develop に反映済み（#3842）。AI 周りのコード変更は、Phase 3 のどの段階からでも始められる。
- 表示の置き換えより先に AI を止めると、画面に何も出ない期間ができる。そのため、**v4 の表示が integration で動いた後に撤去する**。

| 順 | 内容 | 注意 |
|----|------|------|
| 1 | `upsert` を UpdateItem 化する（§2.4） | AI 型を外す前に行う。FR-24 の前提 |
| 2 | web: AI 表示（投資判断・予測リターン・確信度・AI 解析・サポート／レジスタンス）と予測精度ダッシュボードを撤去し、v4 の表示に置き換える | `/prediction-evaluation` は `/axis-performance` へリダイレクト |
| 3 | batch / core: `summary` の AI 解析、`evaluation`、`prediction-judger` / `prediction-aggregator`、`ai-analysis-result`、`chart-renderer` と依存パッケージ（openai・echarts・@resvg・zod の不要分） | 型・マッパーから AI 属性を外す（データは残る） |
| 4 | infra: Lambda の `OPENAI_API_KEY`、`openAiApiKey` の受け渡し（bin・deploy workflow）、`evaluation` の Lambda と EventBridge ルール | — |
| 5 | Secrets Manager のシークレット `nagiyu-stock-tracker-openai-api-key-{env}` | **本番リソースの削除のため、実施前に人に確認する**。スタックから外すと削除される（復旧期間あり）。キーの失効（OpenAI 側）は人が行う |
| 6 | 権限: `stocks:read-evaluation` を Permission 型と stock-admin ロールから削除（ADR-V4-03） | libs/common の変更。他サービスへの影響がないことを確認する |

- docs の更新（UC-006・UC-011・UC-012、SCR-007、採点関連の ADR、AI 改善ロードマップの削除）は Phase 4 で行う（要件 §7）。

---

## 6. API 仕様（型）

【外部設計の合意後に詳細化】エンドポイント一覧は external-design.md §2。

---

## 7. Phase 3（実装）の分割案

【分析結果と方式の決定後に作成し、人と合意する】
