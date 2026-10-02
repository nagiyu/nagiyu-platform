# ゴールデンテスト用フィクスチャの生成

`golden.test.ts` が TypeScript 実装 (`computeForDate`・`computeOutcomes`・`determineNeutralBand`) と突き合わせる期待値 `../fixtures/golden.json` を生成する Python スクリプト。jest・tsc・eslint の対象外 (`.py` のため拾われない)。

- `golden.py`: 合成データの生成と期待値の計算、JSON の書き出し。基準値 (`rolling_base`)・中立帯 (`determine_band`)・順次寄与は分析時の実装を写したもの
- `prep.py`: 除外・翌営業日・ターゲット・判断軸の前処理
- `wf.py`: L2 正則化ロジスティック回帰 (`LR`) とロジット変換

## 実行

```bash
pip install pandas numpy scipy pyarrow
python3 golden.py   # このディレクトリで実行する
git diff --exit-code ../fixtures/golden.json   # ロジックを変えていなければ差分なし
```

中間成果物は一時ディレクトリに作り、終了時に消す。

## 設計上の注意

- 実データではなく、固定シード (20260927) の合成データを使う。実データに依存するとデータ更新のたびに期待値が変わるため。JP 3 銘柄 (TSE)・US 3 銘柄 (NASDAQ・NYSE・AMEX) に、欠落日・極端リターン・件数不足のケースを混ぜてある
- 名目引け時刻の算出に使う取引所の値 (`prep.py` の `TZ`・`OPEN`・`CLOSE`) は、テスト側の `support/exchanges.ts` の `REAL_EXCHANGES` と同じ実際の値。`core` は取引所マスタを引数で受け取るため、変える必要はない

## 期待値がずれたとき

実装を変えて期待値がずれたときは、まずこのスクリプトのロジックが、TypeScript の実際の選択規則 (学習に使うサンプルの条件など) と食い違っていないかを疑う。両者が一致して初めて、TypeScript 実装のバグ候補になる。
