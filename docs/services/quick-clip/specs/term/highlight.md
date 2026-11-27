---
sources:
  - services/quick-clip/core/src/types.ts
  - services/quick-clip/core/src/mappers/highlight.mapper.ts
  - services/quick-clip/core/src/libs/highlight.service.ts
  - services/quick-clip/core/src/libs/highlight-extractor.service.ts
  - services/quick-clip/web/src/lib/server/highlight-recovery.ts
  - services/quick-clip/web/src/lib/highlight-edit-lock.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/recover/route.ts
sources_hash: 098b26528ebe652d22924883ae6b0a320017e8e2811be750b303e367ada9f837
---

# 見どころとクリップの状態

動画の中で、見る価値が高いと判定された区間。1 件ごとに、採否と、切り出したクリップの状態を持つ。

## 説明

| 項目 | 内容 |
|---|---|
| `highlightId` | UUID v4。テーブルのキーは[ジョブのテーブル](../data/jobs-table.md)にある |
| `order` | 1 から始まる番号。抽出のときに、開始時刻の昇順で付く。開始・終了を調整しても振り直さない。画面では `#1` のように出し、一覧は `order` の昇順に並ぶ |
| `startSec`、`endSec` | 区間の開始と終了 (秒)。小数を持つことがある。更新では 0 以上の有限の数で、開始が終了より小さくなければならない。終了を動かすときは、ジョブの `durationSec` 以下でなければならない (ない場合は上限なし。保存済みの終了が超えていても、終了を動かさない更新は通る) |
| `source` | 抽出の根拠。`motion` (映像の変化)、`volume` (音量)、`emotion` (感情)、`both` (別々の根拠の区間が重なって 1 件になったもの) |
| `dominantEmotion` | 感情が根拠のときの、一番高い感情。`laugh`、`excite`、`touch`、`tension` |
| `status` | 採否。`unconfirmed` (未確認)、`accepted` (使える)、`rejected` (使えない)。抽出の直後は `unconfirmed` |
| `clipStatus` | クリップの状態 (下表) |
| `clipGeneratingStartedAt` | `GENERATING` にした時刻 (epoch ミリ秒)。止まった作り直しを見分けるために使い、古いデータにはない |
| `expiresAt` | ジョブと同じ期限。同じ時刻に自動で削除される。TTL の削除は遅れるので、期限を過ぎた見どころは、削除の前でも「ない」ものとして扱う (`expiresAt` が今以前なら期限切れ)。一覧には出さず、取得は `null`、更新は「見つからない」エラーになる |

- クリップの S3 キーは `outputs/{jobId}/clips/{highlightId}.mp4` で、保存はせずに導く
- 旧形式の小文字始まりの属性名も読む。必須項目が欠けたり、`source`、`status`、`clipStatus`、`dominantEmotion` が許可外の値だったりすると、読む側が例外にする
- 抽出の根拠の決め方は[抽出バッチ](../batch/extract.md)にある

## クリップの状態

| `clipStatus` | 意味 | 変える主体 |
|---|---|---|
| `PENDING` | 切り出し前 | 抽出バッチが、見どころを組み立てる間だけ持つ。保存するときは `GENERATED` にするので、新しく抽出した見どころに `PENDING` は残らない |
| `GENERATING` | 作り直している最中 | [見どころ API](../api/highlights.md) が、開始・終了の更新かリトライの受付で設定する |
| `GENERATED` | 切り出し済みで、再生できる | [抽出バッチ](../batch/extract.md)が保存するとき。[クリップ再生成](../batch/clip-regenerate.md)が作り直しに成功したとき |
| `FAILED` | 作り直しに失敗した | クリップ再生成が失敗したとき。再生成の起動に失敗したとき。止まったままの `GENERATING` を、復旧の API が見切ったとき |

- 同じ見どころの作り直しは同時に 1 件まで。`GENERATING` の間は、時刻の変更とリトライを API が 409 で断り、画面も開始・終了の入力とリトライを止める。採否の変更は止めない
- 作り直しの Lambda が強制終了すると `GENERATING` のまま残る。見どころ確認画面が一覧を取る前に復旧の API を呼び、`clipGeneratingStartedAt` から 360 秒 (Lambda のタイムアウト 300 秒に、余裕の 60 秒を足した値) を過ぎたものを、止まったとみなして `FAILED` にする。`clipGeneratingStartedAt` がないデータは、対象にしない
- 開始か終了を変えると、採否が `accepted` か `rejected` なら `unconfirmed` に戻る

## 理由

- **作り直しを重ねない**: 開始・終了を続けて変えると、同じ見どころの作り直しの Lambda が同時に何件も起動する。どれも同じ S3 のキーに書くので、S3 の `SlowDown` で失敗するものが出る。また、最後に書き終えたものが残るので、後から変えた開始・終了ではなく、先に変えた時点の内容がクリップとして残りうる。このため、`GENERATING` の間は、画面が入力を止め、サーバーも時刻の変更と作り直しの要求を 409 で断る
- **作り直しの Lambda の非同期の起動は、再試行しない**: 非同期の起動の既定の再試行は、起動したときの古い開始・終了のまま走る。後から変えた内容を上書きして、上の逆転をさらに起こしやすくする。失敗した見どころは `FAILED` にし、画面のリトライで再開する
- **止まった `GENERATING` は、時刻で見切る**: Lambda が強制終了すると、失敗時の処理が走らず、`GENERATING` のまま残る。残ると、時刻の変更もリトライも 409 で断られ、誰も直せない。そこで、`GENERATING` にした時刻を見どころに記録し、画面が一覧を取るときに、そこから 360 秒を過ぎた見どころを `FAILED` にする。このためだけの定期実行や、失敗時の送り先は設けない
- **360 秒は、Lambda のタイムアウト (300 秒) に 60 秒の余裕を足した値**: 時刻は、Web が起動を頼んだ時点で記録する。非同期の起動はキューで待ってから動き出すので、タイムアウトちょうどで見切ると、まだ動いている作り直しと重なりうる
- **サーバーの判定は、条件付きの書き込みにしない**: サーバーは、読んでから書く。同じ画面からは入力を止めるので重ならない。別のタブや端末からミリ秒単位で同時に変えた場合だけ重なりうるが、一人で使う画面なので許容する
- **時刻を記録する前のデータは、復旧の対象にしない**: `GENERATING` の時刻がないデータは、いつから `GENERATING` なのかわからない。作り直しの最中のものを、誤って失敗にしかねないため
