---
id: quick-clip/term/ai-analysis
title: AI 解析
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/libs/batch-job-input.ts
  - services/quick-clip/core/src/libs/quick-clip-batch-runner.ts
  - services/quick-clip/core/src/libs/transcription.service.ts
  - services/quick-clip/core/src/libs/emotion-highlight.service.ts
  - services/quick-clip/core/src/libs/usage.service.ts
sources_hash: 3c65556d0a77a0f452c828bf85fc89c459274a1b3cce9621fbdd2af6c0183a8a
terms: [quick-clip/term/transcript]
related_cards: [quick-clip/batch/extract, quick-clip/api/jobs, quick-clip/flow/usage-metering, quick-clip/screen/upload, quick-clip/term/usage-tier]
related_adr:
  - services/quick-clip/architecture.md#ADR-007
  - services/quick-clip/architecture.md#ADR-018
---

# AI 解析

OpenAI を使う 2 つの処理、[文字起こし](./transcript.md)と感情分析をまとめた呼び名。見どころの根拠に「感情」を加える。ジョブごとに、するかしないかを決める。

## 説明

| 処理 | 内容 |
|---|---|
| 文字起こし | 音声を `whisper-1` (日本語) でテキストにする |
| 感情分析 | 文字起こしの各行に、`laugh`、`excite`、`touch`、`tension` の 4 つの感情を 0.0〜1.0 で付ける。モデルは `gpt-5.6-luna` |

- 利用者は、アップロードの前に AI 解析をするかを選ぶ。選ばなかったときは、AI 解析ありの残りがあればあり、なければなしで受ける ([ジョブ API](../api/jobs.md))
- AI 解析ありとなしは、月の回数を別々に数える ([利用の段と上限](./usage-tier.md))
- 抽出バッチが AI 解析をするのは、ジョブが AI 解析をするもので、環境変数 `AI_ANALYSIS` が `false` でなく、`OPENAI_API_KEY` があるときだけ。`AI_ANALYSIS` が未設定か空白のときは `true` として扱う。`true` と `false` 以外の値は例外
- 感情分析は文字起こしの結果が 1 行以上あるときだけ走る
- 文字起こしか感情分析が失敗しても、ジョブは失敗にしない。その処理を飛ばして、映像と音量だけで続ける。飛ばした処理は、画面では「(スキップ)」と出る
- AI 解析ありで数えたのに、AI 解析をしなかった (API キーがない、どちらかが失敗した) ジョブは、AI 解析なしの 1 回に付け替える ([利用回数の流れ](../flow/usage-metering.md))
- 抽出の細かい手順は[抽出バッチ](../batch/extract.md)にある

## 関連するカード

- [抽出バッチ](../batch/extract.md)・[ジョブ API](../api/jobs.md)
- [利用回数の流れ](../flow/usage-metering.md)・[利用の段と上限](./usage-tier.md)
- [アップロード画面](../screen/upload.md): AI 解析のスイッチを出す
