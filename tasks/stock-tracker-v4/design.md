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

方式は、dev の DailySummary 履歴でウォークフォワード検証した候補の比較結果を見て、人と合意して決めた。分析の全文とスクリプトは [`analysis/`](analysis/README.md)。

### 1.1 問いと実績の定義

- **市場**: JP = TSE、US = NASDAQ・NYSE・AMEX（ADR-V4-01）。
- **翌営業日**: 同じ銘柄の、基準日より後で最初の DailySummary の日付。#3833 以降は休場日に DailySummary が作られないため、カレンダーを持たずに済む（採点の評価日と同じ考え方）。
- **Q-DIR の実績**: 翌営業日の終値リターン（基準日終値比）− 同日・同市場の有効銘柄の平均。> 0 なら的中。
- **Q-VOL の実績**: 翌営業日の値幅 (高値 − 安値) ÷ 基準日終値 が、その銘柄の平常を上回れば的中。
- **Q-MKT の実績**: 翌営業日の市場平均値幅が、市場の平常を上回れば的中。
- **平常**: 直近 **20 営業日**（基準日を含む）の値幅の平均（人と合意）。20 日分の履歴がない銘柄は、荒れの確度を出さない。
    - 60 日と比べると予測力はやや落ちる（AUC 0.65 vs 0.67）。一方、局面が変わったときに「平常」が追従するため、確率のずれが小さい（ECE 0.037 vs 0.062）。確率を表示する以上、信頼性を優先した。
- **採点から除外するもの**（FR-14。#3830 の結果に揃える）
    - 翌営業日の |リターン| > 20%（株式分割またぎ等）。除外理由を実績に記録する。
    - 休場日コピー足・途中足は、#3833 以降はデータ自体が作られない。初期値算出（FR-13）で過去データを読むときだけ、#3830 の除外リスト（祝日の日付・前レコードと OHLC が同一・CreatedAt が翌営業日の取引開始以降）を適用する。

### 1.2 判断軸の初期セット

| 区分 | 軸 | 種類 | 値 |
|------|----|------|----|
| 単一パターン | 既存 27 パターン（買い 11・売り 16） | 点灯型 | PatternResults が MATCHED なら 1。INSUFFICIENT_DATA は 0 |
| 複合パターン | 買い合致数 ≥ 2、売り合致数 ≥ 2 | 点灯型 | BuyPatternCount / SellPatternCount から |
| 値動きの大きさ | 直近 5 日の値幅（Parkinson）、当日の値幅、出来高比 | 数値型 | 平常比の対数。log(直近 5 日の Parkinson ÷ 直近 20 日の Parkinson)、log(当日値幅 ÷ 平常)、log(当日出来高 ÷ 直近 20 日の平均出来高) |
| 市場レベル | 上記大きさ軸の市場平均、市場平均値幅の平常比（Q-MKT のみ） | 数値型 | 市場の有効銘柄の平均 |

- 出来高が欠けている日は、出来高比の軸を「値なし」とし、合成に寄与させない。
- 軸は `core` のコードで定義する（軸 ID・名前・種類・対象の問い・算出関数）。DB には持たない。

### 1.3 軸と問いの対応（FR-5）

**対応を固定する**（分析結果にもとづく）。

| 問い | 使う軸 |
|------|-------|
| Q-DIR | 単一パターン 27・複合パターン 2 |
| Q-VOL | 大きさ 3 ＋ 市場レベル 3（その銘柄の市場の値） |
| Q-MKT | 市場レベル 3 ＋ 市場平均値幅の平常比 |

- 以下の比較は平常 60 日の構成で行った。全軸を全問いで使うと、Q-DIR で大きさ系の軸がノイズとして効き、基準値より**有意に悪化**した（log loss 差 −0.0023、90% CI [−0.0039, −0.0008]）。Q-VOL ではパターン系を足しても変わらなかった。
- Q-VOL に市場レベルの軸を足すと改善した（log loss 改善 +0.045 → +0.053）。銘柄が荒れるかどうかは、市場全体の荒れ具合にも左右されるためである。
- 軸の定義に「対象の問い」を持たせる（FR-5）。追加した軸も、定義した問いにだけ使う。

### 1.4 合成方式

**L2 正則化ロジスティック回帰**（候補 B。人と合意）を使う。モデルは問いごとに 1 つで、JP・US で共通にする。

```
確率 = σ( logit(基準値) + Σ w_i · x_i )
```

- **基準値をオフセットにする（切片を持たない）**: 学習時も、各サンプル日の時点の基準値（§1.5）をオフセットとして与える。こうすると「どの軸も効いていないときの確率 = 表示する基準値」が厳密に成り立ち、寄与の合計が「確率 − 基準値」に一致する。切片を推定する形と成績は同等だった。
- **縮小（FR-10b）**: L2 正則化（損失の総和に α/2·‖w‖² を加える）で行う。
    - 点灯型軸は 0/1 のまま標準化しないので、点灯回数が少ない軸ほど係数がゼロに寄る。
    - 数値型軸は、学習サンプルの平均・標準偏差で標準化する。標準化のパラメータもスナップショットに保存する。
    - α は Q-VOL・Q-MKT で 20、Q-DIR で 80（強め）とする。α を 5〜80 で変えても成績はほぼ変わらなかった。
- **相関（FR-10c）**: 全軸の係数を同時に推定する。そのため、似た軸（複合軸と構成パターン、Parkinson と当日値幅など）の効きは係数の間で分け合われ、二重には数えられない。相関を無視する縮小付き加算（候補 A）は、軸を足すと過信して成績が悪化した。
- **将来データの不使用（FR-10a）**: 予測日 D のモデルは、**ラベルが D の引けまでに確定した**サンプルだけで学習する。JP の予測時点では、US の同日ラベル（US の引けのほうが後）は使わない。
- **学習窓と更新（FR-10d）**: 拡張窓（利用できる全期間）で、**日次**に再推定する。
    - 局面への追従は、基準値の直近 60 日化（§1.5）と平常の 20 日化（§1.1）が担う。
    - 直近 60 日の学習窓は Q-DIR で有意に悪化した。週次更新は日次とほぼ同じ成績だった。そのため、単純な日次・拡張窓にした。
- **推定**: ニュートン法（IRLS）で TypeScript に自前実装する。1 年分（約 3.4 万行 × 7 軸）でも数十 ms で済む。乱数を使わないので、同じ入力からは同じ結果が出る（NFR-3）。
- **件数不足の目印**（external-design の「件数不足」）: 点灯型軸のうち、学習サンプル中の点灯回数が 30 回未満のものに付ける。数値型軸は毎日値があるので付かない。

**寄与の分解**

- 基準値の logit から、|w_i x_i| の大きい順に 1 軸ずつ足していく。そのたびの確率の増分を、その軸の寄与（pt）とする。合計は必ず「確率 − 基準値」に一致する。
- 「その軸だけを外したときの差」で測る方法は採らなかった。基準値から離れるほど合計がずれるためである（例: 確率 − 基準値 = −21.7pt に対して、合計は −17.7pt）。

**検証結果**（評価期間 2026-05-19〜09-25、平常 20 日。M0 = 全期間平均の基準値だけを出した場合）

| 問い | log loss 改善（M0 比） | AUC | ECE | 表示への影響 |
|------|----------------------|-----|-----|-------------|
| Q-DIR | −0.0004（差なし） | 0.49〜0.50 | 0.007 | 予測力はない。確率はほぼ基準値 ±5pt に収まり、当面は全件「中立」になる（人と合意） |
| Q-VOL | +0.028 [+0.021, +0.036] | 0.63 | 0.021 | 前半・後半・JP・US のいずれでも改善した。確率帯ごとの実績は、おおむね予測と一致する |
| Q-MKT | +0.084（n=169 日） | 0.8 前後 | 0.05〜0.08 | 日数が少なく、確率としては信用できない。「参考値」と明示して出す（人と合意） |

- 買い合致数 ≥ 2 は、評価期間の後半に的中 73%（56 件）と再現した。しかし学習期間（3〜7 月）では 48% で効いておらず、重みは付かなかった。
    - 局面で当たり外れが反転する実例である。成績を溜め続けて重みを更新する仕組み（FR-10d）が、この種の軸を拾う唯一の経路になる。
- 評価期間は約 4 か月で、局面は「7 月の荒れ」と「8〜9 月の凪」の 2 つしかない。成績画面（SCR-007）で継続的に確認する前提である。

### 1.5 基準値と中立帯

**基準値**（FR-11）

- その問いの、予測日の時点で採点が確定したサンプルのうち、**直近 60 営業日**の的中率（JP・US 合算）とする。20 件未満のときは、全期間の的中率を使う。
- 全期間の平均だと、荒れる割合が局面で 40% から 24〜33% へずれても追従しない。方式の選択よりも、この追従のほうが確率の信頼性に効いた。

**中立帯**（FR-11a）

過去の予測を「確率 − 基準値」で帯に分け、実績が基準値と有意に違う帯より外側を「寄りあり」とする。

- 帯: 「確率 − 基準値」を 5pt 刻みにする（Q-MKT は 10pt 刻み）。
- 検定: 各帯で、実現率とその帯の基準値の平均を両側二項検定で比べ、Holm 法で多重比較を補正する（有意水準 5%）。件数が 30 件（Q-MKT は 10 件）未満の帯は判定しない。
- 決め方: 基準値を含む帯から、上下それぞれ外側へ進む。最初に次の 3 つを満たした帯と、それより外側を寄りありとする。外側の帯は、件数不足でも寄りありに含める。
    - 有意である
    - 差の向きが合っている
    - 差が 3pt 以上ある
- 条件を満たす帯が見つからない側は、寄りなし（上限・下限が ±∞）とする。
- 最小差 3pt を入れるのは、件数が溜まると 1〜2pt の差でも有意になり、中立帯が実質なくなるのを防ぐためである。
- 見直し: 稼働開始時に、初期値算出（§3.3）で作った過去の予測から決める。その後は **30 営業日ごと**に、それまでの全予測で判定し直す。判定した帯は ModelSnapshot に保存し、次の見直しまで使う。
- 検証結果（06-30〜09-24 で模擬）:
    - Q-VOL は、中立帯が [−5, +15) から [0, +5) へ狭まり、中立は 38% だった。寄りありの実績は基準値から明確に離れていた。
        - 上側: 実現率 53%（基準値 40%、959 件）
        - 下側: 実現率 27%（基準値 41%、3,143 件）
    - Q-DIR・Q-MKT は有意な帯がなく、全件「中立」「平常」になった（要件どおりの挙動）。

**同じ確率帯の過去実績**（詳細ダイアログ）

- 予測確率を 5pt 刻みにした帯ごとに、予測日より前に採点済みの予測の件数と的中率を出す。
- Q-VOL は 4 か月分で、ほとんどの帯が 30 件を超える。Q-DIR は確率が 45〜55% に集中する。Q-MKT は、1 年分溜まるまでどの帯も 30 件に届かない。

**Q-MKT の「参考値」**（external-design の `lowSample`）

- 市場ごとの採点済み日数が 250 営業日（約 1 年）に満たない間は、`lowSample = true` とする。

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
- `ModelSnapshot` の中身:

```typescript
type ModelSnapshotItem = {
  Question: Question;
  Market: Market;       // 算出した市場（タイミング）。モデル自体は JP・US 共通
  Date: string;
  ModelVersion: string;
  Alpha: number;
  Weights: Record<AxisId, number>;
  Standardization: Record<AxisId, { mean: number; std: number }>;  // 数値型軸のみ
  Baseline: number;
  NeutralBand: { lower: number; upper: number; decidedOn: string }; // 「確率 − 基準値」の範囲
  BandHistory: { lower: number; upper: number; count: number; hitRate: number }[]; // 5pt 帯ごとの過去実績
  AxisStats: Record<AxisId, {
    count: number;
    hitRate: number;
    diffFromBaseline: number;
    meanExcessReturn?: number;
    lowSample: boolean;
  }>;
  TrainingSize: number;
  CreatedAt: number;
};
```

- 重み・基準値・中立帯は、どの問いも JP・US 共通である（市場別のモデルや市場ダミーは、検証で改善しなかった）。ただし、JP と US では引けの時刻が違い、同じ日でも算出する時点で確定しているラベルが異なる（US の前日分のラベルは US の引けで確定する）。そのため、スナップショットは「算出した市場 × 日」ごとに持つ。中身は、その時点で確定したデータで学習した共通モデルである。
- 1 アイテムの大きさは軸 35 個程度で数 KB に収まる。

### 2.4 AI 撤去後の DailySummary の扱い（FR-24）

- 型から AI 関連の属性（`AiAnalysisResult` / `AiAnalysisError` / `Evaluation*`）を外しても、DynamoDB 上のデータは残す。
- **注意**: 現行の `upsert` は PutItem で丸ごと上書きする。型から AI 属性を外したまま再判定（新パターン追加時の `needsStaticAnalysis`）が走ると、既存アイテムの AI データが消えて FR-24 に反する。撤去と同時に、`upsert` を「サマリーが管理する属性だけを UpdateItem で更新する」形に変える。

---

## 3. バッチ構成

### 3.1 新しいバッチ: `forecast`

サマリー生成（`summary`）とは別の Lambda にする（NFR-2 障害分離）。1 回の実行で、市場ごとに次の 3 段を順に行う。いずれも冪等で、途中で落ちても次の実行で続きから進む。

1. **採点**: 基準日 D の DailySummary が揃ったら、前営業日の Forecast / MarketForecast に Outcome を追記し、PerformanceDaily を更新する。
2. **重みの更新**: D の時点で採点済みのデータだけから、重み・基準値・中立帯を算出し、ModelSnapshot(D) を書く。重みは日次で再推定し、中立帯は 30 営業日ごとの見直し日以外は直前のスナップショットから引き継ぐ。
3. **確度の算出**: D の各銘柄の軸の値と確率を算出して Forecast(D) を書き、市場の MarketForecast(D) を書く。

**起動タイミング**

- `summary` と同じく毎時起動し、市場ごとに「対象日の DailySummary が揃ったか」を見て処理する。US は 3 取引所をまとめて 1 市場として扱う。
- 「揃った」の判定: 市場の有効ティッカー（直近 7 日以内に DailySummary がある銘柄）がすべて D のサマリーを持つか、翌営業日の取引開始が近づいた（打ち切り）場合。打ち切りで欠けた銘柄は確度なしとし、市場平均は揃った銘柄で計算する。
- `summary` の実行終了時に `forecast` を非同期で起動し、毎時の起動を待たずに済むようにする（NFR-1）。`/api/summaries/refresh` による手動生成でも同じ流れで走る。

**性能の見積もり**

- 学習は、分析での実測で約 1.6 万行 × 29 軸が 17ms（numpy）。1 年分（約 3.4 万行）を TypeScript で回しても、推定そのものは 1 秒未満の見込み。過去サンプルの読み出し（Forecast の Query）がボトルネックになる場合は、学習用データを S3 に日次で追記する案を検討する。

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

エンドポイント一覧は external-design.md §2。認証は現行どおり `withAuth(getSession, 'stocks:read', …)`。エラーメッセージは日本語の定数（`ERROR_MESSAGES`）で返す。

### 6.1 共通の型

```typescript
type Lean = 'UP' | 'DOWN' | 'HIGH' | 'NEUTRAL';  // 強含み / 弱含み / 荒れそう / 中立・平常

/** 一覧・カード用の確度の要約 */
type ProbabilityView = {
  probability: number;   // 0〜1。DIR は P(市場平均を上回る)、VOL・MKT は P(平常より荒れる)
  baseline: number;
  lean: Lean;            // 中立帯との比較結果（算出時に確定して保存したもの）
};
```

- `lean` はサーバー側で決めて返す。表示のラベル文言（「強含み 56%」「弱含み 58%」等）への変換は web 側の純粋関数で行う（`DOWN` のときは 1 − probability を表示する）。

### 6.2 GET /api/summaries?date=（変更）

```typescript
type SummariesResponse = {
  exchanges: ExchangeSummaryGroupResponse[];   // 既存
  marketForecasts: MarketForecastResponse[];   // 追加（JP・US）
};

type MarketForecastResponse = {
  market: 'JP' | 'US';
  date: string;                        // 基準日
  forecast: (ProbabilityView & { lowSample: boolean }) | null;  // 算出なし・失敗は null
};

// TickerSummaryResponse の変更
// - 削除: aiAnalysisResult, aiAnalysisError, patternDetails
// - 追加:
type TickerSummaryResponse = /* 既存の項目 */ {
  forecast: {
    dir: ProbabilityView | null;
    vol: ProbabilityView | null;       // 平常の算出に必要な履歴が足りなければ null
    lit: { total: number; buy: number; sell: number };  // 点灯型軸の点灯数（複合軸を含む）
  } | null;                            // Forecast アイテムがなければ null
};
```

- `/api/summaries/{tickerId}` も同じ `TickerSummaryResponse` を返す。
- `date` 省略時の「最新日」は現行どおり DailySummary 側で決め、同じ日付の Forecast を結合する。

### 6.3 GET /api/forecasts/{tickerId}?date=（新規）

```typescript
type ForecastDetailResponse = {
  tickerId: string;
  date: string;
  questions: {
    DIR: QuestionDetail | null;
    VOL: QuestionDetail | null;
  };
};

type QuestionDetail = {
  probability: number;
  baseline: number;
  lean: Lean;
  neutralBand: { lower: number; upper: number };
  bandHistory: { lower: number; upper: number; count: number; hitRate: number } | null;
  axes: AxisBreakdown[];   // 寄与の絶対値の降順。点灯しなかった点灯型軸は lit=false で末尾
};

type AxisBreakdown = {
  axisId: string;
  name: string;
  kind: 'FLAG' | 'NUMERIC';
  lit?: boolean;           // FLAG のみ
  ratio?: number;          // NUMERIC のみ。平常比（例: 1.4）
  performance: {           // 算出時点の成績（ModelSnapshot から。FR-12）
    count: number;
    hitRate: number;
    diffFromBaseline: number;
    meanExcessReturn?: number;  // DIR のみ
  };
  contribution: number;    // 寄与（確率の差、−1〜1。表示時に pt 換算）
  lowSample: boolean;
};
```

- 取引所 ID は `tickerId` の分割ではなく、Ticker マスタから引く（現行の `/api/summaries/{tickerId}` は `tickerId.split(':')[0]` を使っており、Exchange.Key ≠ ExchangeID の取引所では 404 になる）。

| ステータス | 説明 |
|-----------|------|
| 400 | date の形式が不正 |
| 404 | ティッカーが存在しない、または指定日の Forecast がない |

### 6.4 GET /api/axis-performance?question=&period=&market=（新規）

```typescript
type AxisPerformanceQuery = {
  question: 'DIR' | 'VOL' | 'MKT';
  period: '30d' | '90d' | 'all';   // 予測日で切る
  market: 'ALL' | 'JP' | 'US';     // MKT では ALL を受け付けない（400）
};

type AxisPerformanceResponse = {
  question: 'DIR' | 'VOL' | 'MKT';
  period: '30d' | '90d' | 'all';
  market: 'ALL' | 'JP' | 'US';
  from: string;
  to: string;
  evaluatedCount: number;
  hitRate: number;               // 期間全体の実現率
  neutralBand: { lower: number; upper: number } | null;  // 最新スナップショットのもの（網掛け用）
  calibration: { lower: number; upper: number; count: number; meanProbability: number; hitRate: number }[];
  axes: {
    axisId: string;
    name: string;
    kind: 'FLAG' | 'NUMERIC';
    count: number;               // FLAG は点灯回数、NUMERIC は平常より高かった回数
    hitRate: number;
    diffFromBaseline: number;
    meanExcessReturn?: number;   // DIR のみ
    currentWeight: number;       // 最新スナップショットの係数
    lowSample: boolean;
  }[];
};
```

- 集計は PerformanceDaily（予測日ごとの集計）を期間分合計して作る。Forecast を全件読まない。
- 数値型軸の「件数・的中率」は、値が平常より高い日（平常比 > 1）を「点灯」とみなして数える。表示用の定義で、合成には値そのものを使う。

---

## 7. Phase 3（実装）の分割案

実装単位ごとに Draft PR を出し、integration（`integration/3834-stock-tracker-v4`）へ取り込む。

| 単位 | 内容 | 依存 | dev での確認 |
|------|------|------|-------------|
| **3-1 算出の中核** | `core` に純粋関数として実装する。軸の定義と算出、平常、実績と採点、ロジスティック回帰（IRLS）、基準値、中立帯、寄与、確率帯の実績。将来データ混入のテスト（§4）と、`analysis/` を参照実装にしたゴールデンテストも含む | なし | なし（DB・画面に触れない） |
| **3-2 データ層とバッチ** | Forecast 系アイテムのリポジトリ、`forecast` バッチ（採点 → 重み → 確度）、`summary` からの起動、infra（Lambda・EventBridge。dev でも有効）、初期値算出（リプレイ） | 3-1 | dev で初期値算出を走らせ、Forecast・ModelSnapshot・PerformanceDaily ができることと、その内容を確認する |
| **3-3 画面と API** | 一覧 API の変更、`/api/forecasts`・`/api/axis-performance`、SCR-004（荒れ予報カード・列・詳細ダイアログ）、SCR-001 のサマリーパネル、SCR-007。旧パスのリダイレクト。AI の表示はこの単位で置き換わる | 3-2（型は 3-1） | dev の画面で確認する（人の目視レビュー） |
| **3-4 AI の撤去** | §5 の順 1・3〜6（`upsert` の UpdateItem 化、AI 解析・採点バッチ・集計・依存パッケージ、infra の OpenAI 関連、`stocks:read-evaluation`） | 3-3 | dev で `summary` がサマリーを作れること、既存の AI データが消えないことを確認する |

- 3-1 と 3-2 は、設計がほぼ機械的に決まっている。人の判断が要るのは、3-3 の見た目と、3-4 のシークレット削除（本番リソース）である。
- 3-3 の web 側の作業は、3-2 の型が固まれば、フィクスチャで先に進められる。
- 各単位は実装サブエージェント 1〜2 回分の規模を見込む。3-3 は画面数が多いので、「一覧・詳細ダイアログ・トップ」と「成績画面」の 2 つの PR に分けてよい。
- 進め方（別セッションで回すか等）は、Phase 2 の終わりに人と合意する。
