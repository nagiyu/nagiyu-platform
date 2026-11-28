---
sources:
  - infra/quick-clip/lib/storage-stack.ts
  - services/quick-clip/web/src/app/api/jobs/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/transcript/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/download/route.ts
  - services/quick-clip/web/src/app/page.tsx
  - services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx
  - services/quick-clip/core/src/libs/quick-clip-batch-runner.ts
  - services/quick-clip/lambda/clip/src/handler.ts
  - services/quick-clip/lambda/zip/src/handler.ts
sources_hash: aa41900e397c5a3093651d487e442237e4d50a516a9a6d5e088de22df25fe38b
---

# ストレージ

アップロードされた動画と、切り出したクリップ・文字起こし・ZIP を置く S3 バケット。置いたものは 1 日で消える。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-quick-clip-storage-{env}` | S3 バケット | 動画とクリップなど、ジョブの成果物の置き場 |

`{env}` は `dev` か `prod`。スタックは `NagiyuQuickClipStorage{Env}` ([デプロイ先](../deploy.md))。暗号化 (SSE-S3)・パブリックアクセスの遮断・HTTPS 以外のアクセスの拒否は、[サービスの S3 バケット](../../../../platform/specs/resource/service-bucket.md)が固定する。

## 設定値

| 項目 | 値 |
|---|---|
| ライフサイクル | すべてのオブジェクトを、作ってから 1 日で削除する (キーの接頭辞で絞らない) |
| バージョニング | なし |
| CORS の許可するオリジン | この環境のサービスの URL だけ ([デプロイ先](../deploy.md)のホスト名) |
| CORS の許可するメソッド | `PUT` だけ |
| CORS の許可するリクエストヘッダー | `Content-Type`、`x-amz-*` |
| CORS の公開するレスポンスヘッダー | `ETag` |
| 削除ポリシー | 削除する (dev・prod とも) |
| `autoDeleteObjects` | 有効 |

### 削除ポリシー

| 操作 | 起きること |
|---|---|
| スタックの削除 | バケットを削除する。`autoDeleteObjects` が、先にバケットの中のオブジェクトをすべて消す |
| ライフサイクルによる削除 | 作ってから 1 日を過ぎたオブジェクトを、S3 が順次消す |

- ライフサイクルは、不完全なマルチパートアップロードの掃除を持たない。やめたアップロードは、アップロード中止の API が中止する ([ジョブ API](../api/jobs.md))

## キー

| キー | 置くもの | 書くもの | 読むもの |
|---|---|---|---|
| `uploads/{jobId}/input.mp4` | アップロードされた元の動画 | ブラウザ (署名付き URL で直接 `PUT`) | 抽出バッチ、clip-regenerate |
| `outputs/{jobId}/clips/{highlightId}.mp4` | 見どころのクリップ | 抽出バッチ、clip-regenerate | クリップの署名付き URL を作る Web ([見どころ API](../api/highlights.md))、zip-generator |
| `outputs/{jobId}/transcript.json` | 文字起こし | 抽出バッチ (文字起こしが 1 行もないときは置かない) | 文字起こしの API ([文字起こし API](../api/transcript.md))、zip-generator |
| `outputs/{jobId}/clips.zip` | 採用したクリップの ZIP | zip-generator | ZIP の署名付き URL を作る Web ([ダウンロード API](../api/download.md)) |

- 動画のキーは、一度の `PUT` でも分割のアップロードでも同じ。分割のときは、ブラウザが部品ごとの署名付き URL に `PUT` し、全部を送り終えてから結合する ([ジョブ API](../api/jobs.md))
- 権限は[Web の実行環境](./web-runtime.md)、[バッチの実行環境](./batch-runtime.md)、[ワーカーの実行環境](./worker-runtime.md)にある

## 理由

- 動画をブラウザから S3 へ直接 `PUT` するので、バケットが Web のオリジンからの `PUT` を許可する。Web の Lambda を経由させると、メモリとタイムアウトの制約に当たる
- CORS で `ETag` を公開するのは、分割のアップロードで、ブラウザが部品ごとの `PUT` のレスポンスから `ETag` を読み、結合の依頼 (`complete-upload`) に渡すため。公開しないと、ブラウザの JavaScript から読めない
- 許可するメソッドを `PUT` だけにするのは、ブラウザが JavaScript から S3 へ送る操作が `PUT` だけだから。クリップの再生と ZIP のダウンロードは、署名付き URL を `video` 要素とリンクに渡して取得する
