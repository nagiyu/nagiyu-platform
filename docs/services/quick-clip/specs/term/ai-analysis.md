---
sources:
  - services/quick-clip/core/src/libs/batch-job-input.ts
  - services/quick-clip/core/src/libs/quick-clip-batch-runner.ts
  - services/quick-clip/core/src/libs/transcription.service.ts
  - services/quick-clip/core/src/libs/emotion-highlight.service.ts
  - services/quick-clip/core/src/libs/usage.service.ts
  - services/quick-clip/web/src/app/api/jobs/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/complete-upload/route.ts
  - services/quick-clip/web/src/app/page.tsx
  - services/quick-clip/web/src/app/jobs/[jobId]/page.tsx
sources_hash: ebf84819114e8f664e5606b23fd3baaff700bd4fc42b934d69621c6022c29238
---

# AI 解析

OpenAI を使う 2 つの処理、[文字起こし](./transcript.md)と感情分析をまとめた呼び名。見どころの根拠に「感情」を加える。ジョブごとに、するかしないかを決める。

## 説明

| 処理 | 内容 |
|---|---|
| 文字起こし | 音声を発話の区間に分け、`gpt-transcribe` (日本語) でテキストにする |
| 感情分析 | 文字起こしの各行に、`laugh`、`excite`、`touch`、`tension` の 4 つの感情を 0.0〜1.0 で付ける。モデルは `gpt-5.6-luna`。採点の指示は、ゲーム実況の文字起こしとして書いている |

- 感情分析が各行に付ける 4 つの値を、感情スコアと呼ぶ。見どころの強さは、感情フィルターに応じて、この値から決まる
    - 感情フィルターは、見どころの抽出で重視する感情の指定。`laugh`、`excite`、`touch`、`tension` のいずれかなら、その感情の値を強さにする。`any` (既定) なら、4 つの感情の最大値を強さにする。どの場合も、感情が根拠の見どころには、一番高い感情が `dominantEmotion` として付く ([見どころ](./highlight.md))
    - 感情フィルターは、ジョブ作成の API のパラメータとして受け付けるだけで、アップロード画面は渡さない。分割アップロードでは、完了の API に渡した値が使われ、作成のときの値は使われない ([ジョブ API](../api/jobs.md))
    - 感情スコアの配列は保存しない。保存するのは、見どころごとの `dominantEmotion` だけ
- 利用者は、アップロードの前に AI 解析をするかを選ぶ。選ばなかったときは、AI 解析ありの残りがあればあり、なければなしで受ける ([ジョブ API](../api/jobs.md))
- AI 解析ありとなしは、月の回数を別々に数える ([利用の段と上限](./usage-tier.md))
- 抽出バッチが AI 解析をするのは、ジョブが AI 解析をするもので、環境変数 `AI_ANALYSIS` が `false` でなく、`OPENAI_API_KEY` があるときだけ。`AI_ANALYSIS` が未設定か空白のときは `true` として扱う。`true` と `false` 以外の値は例外
- 感情分析は文字起こしの結果が 1 行以上あるときだけ走る
- 文字起こしか感情分析が失敗しても、ジョブは失敗にしない。その処理を飛ばして、映像と音量だけで続ける。飛ばした処理は、処理状況画面で、ラベルのあとに `（スキップ）` (全角のカッコ) が付く
- AI 解析ありで数えたのに、AI 解析をしなかった (API キーがない、どちらかが失敗した) ジョブは、AI 解析なしの 1 回に付け替える ([利用回数の流れ](../flow/usage-metering.md))
- 抽出の細かい手順は[抽出バッチ](../batch/extract.md)にある

## 理由

- 感情分析の結果は、構造化出力 (スキーマを指定した出力) で受ける。感情ごとの値が型のそろった形で返るので、文字列を解釈し直さずに、見どころの強さに使える
- AI 解析が失敗しても、その処理を飛ばして続ける。AI の呼び出しは、API キーがない、通信や API の失敗など、ジョブの外の理由で失敗しうる。それで動画の処理全体を失敗にせず、映像と音量だけで見どころを出せる。API キーを持たないローカルやテストの環境でも、同じ経路で動く
