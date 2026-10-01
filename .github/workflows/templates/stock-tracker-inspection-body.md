# Stock Tracker 確度の定期点検

- 作成日時: {{CREATE_TIME}}
- 点検対象: {{TARGETS}}

確度 (Q-DIR: 翌日の方向 / Q-VOL: 銘柄の荒れ / Q-MKT: 市場の荒れ) が、確率として使える状態を保っているかを確かめる。確度が当てにならないときに「中立」「参考値」へ倒す安全装置はシステム側にある。ここで確かめるのは、その安全装置が働いているかと、局面が変わって軸が効かなくなっていないかである。

## 1. 着手のしかた

1. 人がこの Issue の URL を渡して、Claude Code のセッションを起動する
2. Claude は AWS CLI の `--profile nagiyu-prod` で、テーブル `nagiyu-stock-tracker-main-prod` を**読み取りのみ**で使う
3. セッションの安全判定で prod の読み取りが止まる場合は、人が許可する
4. 書き込みはしない。点検用のスクリプトは置かない (数字は DynamoDB から取り、その場で集計する)

## 2. 使う数字

成績画面 (SCR-007、`/api/axis-performance`) と同じ集計を使う。

- **確率帯の表**: PerformanceDaily (予測日ごとの集計) の `probabilityBands` を期間分合計する。帯は 5pt 刻みで、帯ごとに `count` (件数)・`hitCount` (的中数)・`sumProbability` (確率の合計) を持つ
    - 実現率 = `hitCount` / `count`、平均予測確率 = `sumProbability` / `count`
    - 帯ごとに合計してから割る (日ごとの比率を平均しない)
- **基準値・中立帯**: 最新の ModelSnapshot の `Baseline` と `NeutralBand` を使う
- **期間**: Q-DIR・Q-VOL は直近 30 日、Q-MKT は直近 90 日。画面の `30d` / `90d` と同じく、取得できた最新の予測日を終端として、終端を含む N 日 (カレンダー日) で切る
- **市場**: Q-DIR・Q-VOL は全体 (ALL: JP と US の PerformanceDaily を合わせたもの) を主とし、JP / US 別も見る。ALL の基準値・中立帯は、日付が新しい方の ModelSnapshot を使う
- **キー形式**
    - PerformanceDaily: `PK = PERF#{DIR|VOL|MKT}#{JP|US}`、`SK = DATE#{yyyy-mm-dd}`
    - ModelSnapshot: `PK = MODEL#{DIR|VOL|MKT}#{JP|US}`、`SK = DATE#{yyyy-mm-dd}` (最新は SK 降順で 1 件)

```bash
# 例: Q-VOL・JP の PerformanceDaily を期間で取る
aws dynamodb query --profile nagiyu-prod \
  --table-name nagiyu-stock-tracker-main-prod \
  --key-condition-expression 'PK = :pk AND SK BETWEEN :from AND :to' \
  --expression-attribute-values '{":pk":{"S":"PERF#VOL#JP"},":from":{"S":"DATE#2026-01-01"},":to":{"S":"DATE#2026-12-31"}}'
```

集計の定義は `services/stock-tracker/web/lib/forecast/axis-performance.ts`、キー形式は `services/stock-tracker/core/src/repositories/` の `dynamodb-performance-daily.repository.ts` と `dynamodb-model-snapshot.repository.ts` (mapper の `buildKeys`) を参照する。この Issue の記述が実装とずれていたら、実装を正とする。

## 3. 点検で見ること

上の確率帯の表で、次を確かめる。

- **右肩上がりか**: 高い確率を出した帯ほど、実際によく当たっているか (並べ分けられているか)
- **対角線から離れていないか**: 実現率が平均予測確率に近いか。実現率が低ければ言いすぎ、高ければ控えめすぎ
- **横に広がっているか**: 基準値から離れた確率を出せているか。基準値付近に固まっていれば、中立が多い状態が正しい
- **件数の少ない帯を割り引く**: 件数 30 件未満の帯は判断に使わない

## 4. 異常の基準

次の値は確定済みで、点検の結果を見てから基準を動かさない。基準を変えたくなったら、この点検では変えず、別 Issue で人と決める。

### Q-VOL (直近 30 日)

次のどれかに当たったら異常とする。

- ECE が 0.05 を超えた
    - ECE = 確率帯 (5pt 刻み) ごとの |平均予測確率 − 実現率| を、件数で重み付けした平均
- 件数 100 件以上の確率帯で、実現率が平均予測確率から 10pt 以上ずれた
- 件数 100 件以上の確率帯のうち、平均予測確率が最も高い帯と最も低い帯の実現率の差が 10pt 未満 (並べ分けができていない)
    - 件数 100 件以上の帯が 2 つに満たないときは判定できないので、その旨を記録する
- 基準値が前回の点検から 5pt 以上動いた

確認項目 (異常ではない): 前回の点検から中立帯が変わっていたら、寄りありの帯の実現率が、基準値から想定どおりの向きに離れているかを確かめる。中立の割合は中立帯の見直しで自然に大きく動くため、割合の変化そのものは異常に含めない。

### Q-DIR (直近 30 日)

現状は予測力がなく、全件が「中立」になる前提である。数値の基準は置かない。

- 強含み・弱含み (寄りあり) が出たら、その帯の実績が別の期間 (直近 90 日など) でも再現しているかを確かめる
- 再現しなければ異常とする

{{MKT_SECTION}}

## 5. 判断軸を追加していた場合

前回の点検以降に判断軸を追加していたら (`services/stock-tracker/core/src/forecast/axes.ts` の軸定義と履歴で確かめる)、追加した軸の点灯回数を成績画面の軸ごとの成績で見る。100 件・400 件に達していたら、軸の点検も行う。

- 基準値と比べているか (軸が点灯したときの的中率と、全体の的中率の差)
- 別の期間でも再現しているか
- 件数は足りているか (100 件で的中率の誤差は約 ±10pt、400 件で約 ±5pt)

## 6. 記録とクローズ

結果を、この Issue にコメントで残す。次回の「前回から動いた」の比較に使うため、次を問いごとに書く。

- 件数 (採点済みの総数)
- ECE (Q-VOL)
- 件数 100 件以上の帯の最大のずれ (Q-VOL)
- 最上位と最下位の帯の実現率の差 (Q-VOL)
- 基準値
- 中立帯

どれにも当たらなければ「異常なし」としてクローズする。当たったら原因を調べ、必要なら別 Issue で対応する。
