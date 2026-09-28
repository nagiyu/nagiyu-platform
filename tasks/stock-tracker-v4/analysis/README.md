# 確度算出方式の比較分析（Phase 2）

Phase 2 で確度の算出方式を決めるために行ったウォークフォワード分析のスクリプトと結果。結果の全文は [`report.md`](report.md)。図は `figures/`（分析スクリプトは `out/` に出力する）。Phase 3 では、TypeScript 実装の突き合わせ（ゴールデン値）の参照実装として使う（design.md §4）。

- データ（`../data/`）はリポジトリに含めない。`fetch.py` の手順で dev テーブルから取得する（2026-09-27 時点で 17,162 件、2026-03-02〜09-25）。
- 実行順: `fetch.py` → `prep.py` → `run.py` → `analyze.py` → `neutral.py`、決定構成の検証は `decision.py` → `decision_tables.py` → `DEC_VARIANT=c python3 decision2.py`。
- 依存: `pip install pandas numpy scipy statsmodels scikit-learn pyarrow matplotlib`
- `tasks/stock-tracker-v4/` ごと Phase 4 で削除する。

## golden.py（Phase 3 のゴールデンテスト用フィクスチャ生成）

`services/stock-tracker/core` のゴールデンテスト（`tests/unit/forecast/golden.test.ts`）が TypeScript 実装（`computeForDate`・`computeOutcomes`・`determineNeutralBand`）と突き合わせる期待値 `golden.json` を生成するスクリプト。

- 依存: `prep.py`・`wf.py`（IRLS ロジスティック回帰）・`decision.py`（`rolling_base`）・`decision2.py`（`determine_band`。両側二項検定 + Holm 補正）を import する。これらは分析（`run.py` 等）用に既にあるモジュールをそのまま再利用する。
- 実データではなく、小さな合成データ（`N_DAYS` 日分・JP 3 銘柄（TSE）・US 3 銘柄（NASDAQ・NYSE・AMEX）、意図的な欠落日・極端リターン・件数不足のケースを混ぜたもの）を組み立てて使う。実データに依存すると、データの更新のたびにゴールデン値が変わってしまうため。
- 名目引け時刻の算出に使う取引所マスタの値（Timezone・Start・End）は `prep.py` の `TZ`/`OPEN`/`CLOSE`（JP: Asia/Tokyo 09:00-15:30、US: America/New_York 09:30-16:00）で、TypeScript 側のテスト（`tests/unit/forecast/support/exchanges.ts` の `REAL_EXCHANGES`）と同じ実際の値を使う。`core` はこれを取引所マスタ入力（`ExchangeSessionInfo[]`）として関数の引数で受け取るため（design.md §1.4）、golden.py 側で値を変える必要はない。
- 実行: `python3 golden.py`（`tasks/stock-tracker-v4/analysis/` から）。`services/stock-tracker/core/tests/unit/forecast/fixtures/golden.json` を書き出す。
- 実装を変えて期待値がずれたときは、まず `golden.py` 側のロジックが参照実装（`prep.py`・`wf.py`・`decision.py`・`decision2.py`）や TypeScript の実際の選択規則（例: 学習に使うサンプルの条件）と食い違っていないかを疑う。両者が一致して初めて、TypeScript 実装のバグ候補になる。
