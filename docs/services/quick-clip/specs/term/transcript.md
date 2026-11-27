---
sources:
  - services/quick-clip/core/src/libs/transcription.service.ts
  - services/quick-clip/core/src/libs/quick-clip-batch-runner.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/transcript/route.ts
  - services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx
  - services/quick-clip/lambda/zip/src/handler.ts
sources_hash: e3b26d141158bea3fe6cb4c9d8abc9b4c7ac27c1e34527bcbf158284105f2063
---

# 文字起こし

動画の音声を、時刻つきの行にしたもの。[AI 解析](./ai-analysis.md)でできる。見どころ確認画面で見どころごとに出し、ZIP にも入れる。

## 説明

- 1 行は `{ start, end, text }`。`start` と `end` は動画の先頭からの秒
- 1 行以上あるときだけ、S3 の `outputs/{jobId}/transcript.json` に保存する。0 行のとき、AI 解析をしなかったときは、ファイルを作らない。保存の失敗は、警告のログだけで処理を続ける
- 見どころの区間に重なる行は、`start` が見どころの終了より前で、`end` が見どころの開始より後の行。境界で接するだけの行は重ならない
    - 見どころ確認画面は、選んだ見どころの重なる行を改行で並べて出す。重なる行がなければ出さない。時刻を調整すると、重なる行も変わる
    - [ZIP の生成](../batch/zip-generate.md)は、重なる行を改行でつないだテキストを `clip-NN.txt` にして入れる。空なら入れない
- 1 行は、音声を無音で区切った 1 区間にあたる ([抽出バッチ](../batch/extract.md)の④)。`start` と `end` は区間の端で、話し始めと話し終わりの時刻とは限らない。無音が少ない動画では、1 行が最長 30 秒になる
- 無音の区間は送らない。テキストが空の区間は行にしない。文字起こしの結果に対する、信頼度や反復のパターンによる行の除外はしない
- ファイルは、生成したクリップと同じく、作ってから 1 日で消える ([ストレージ](../resource/storage.md))

## 理由

- **文字起こしを保存して再利用する**: 文字起こしは、感情分析のために取る。すでに時刻つきの行として取れているので、保存して画面と ZIP に出せば、切り抜きのテロップや編集に使える。追加の費用はかからない
- **重なりは、表示や ZIP の組み立てのたびに判定する**: 見どころの区間と行の重なりを保存せず、そのつど求める。時間の調整に、いつも追従できる
- **ZIP の中のファイル名を、見どころの番号にそろえる**: 動画とテキストは、同じ `clip-NN` の拡張子違いにする。ファイル名だけで、対応がわかる
- **誤認識は、そのまま出る (既知の制約)**: 無音の区間での定型文の聞き間違い (ハルシネーション) などが、そのまま表示と ZIP に出る。誤認識を除く仕組みは持っていない

