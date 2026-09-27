# 確度算出方式の比較分析（Phase 2）

Phase 2 で確度の算出方式を決めるために行ったウォークフォワード分析のスクリプトと結果。結果の全文は [`report.md`](report.md)。図は `figures/`（分析スクリプトは `out/` に出力する）。Phase 3 では、TypeScript 実装の突き合わせ（ゴールデン値）の参照実装として使う（design.md §4）。

- データ（`../data/`）はリポジトリに含めない。`fetch.py` の手順で dev テーブルから取得する（2026-09-27 時点で 17,162 件、2026-03-02〜09-25）。
- 実行順: `fetch.py` → `prep.py` → `run.py` → `analyze.py` → `neutral.py`、決定構成の検証は `decision.py` → `decision_tables.py` → `DEC_VARIANT=c python3 decision2.py`。
- 依存: `pip install pandas numpy scipy statsmodels scikit-learn pyarrow matplotlib`
- `tasks/stock-tracker-v4/` ごと Phase 4 で削除する。
