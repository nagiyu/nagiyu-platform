---
sources:
  - infra/codec-converter/lib/codec-converter-stack.ts
  - infra/common/src/storage/service-bucket.ts
  - services/codec-converter/batch/src/index.ts
  - services/codec-converter/core/src/constants.ts
  - services/codec-converter/web/src/app/api/jobs/route.ts
sources_hash: d8579dc5bfab3c9c56622f8b5f94868702fd9e59021666e766822dd6f65607e6
---

# ストレージ

変換前の動画と変換後の動画を置く S3 バケット。ブラウザが署名付き URL で直接読み書きし、変換バッチが直接読み書きする。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-codec-converter-storage-{env}` | S3 バケット | 入力と出力の動画 |

`{env}` は `dev` か `prod`。スタックは `NagiyuCodecConverter{Env}` で、[Web の実行環境](./web-runtime.md)や[Batch の実行環境](./batch-runtime.md)と同じスタックにある。

## 設定値

バケットは、共通部品 `createServiceBucket` で作る。暗号化 (SSE-S3)・パブリックアクセスの全面ブロック・HTTPS 限定は、[サービスの S3 バケット](../../../../platform/specs/resource/service-bucket.md)のとおり固定である。差分は次のとおり。

| 項目 | 値 |
|---|---|
| バージョニング | 無効 |
| ライフサイクル | ルール `DeleteOldFiles`。オブジェクトを作成から 1 日で削除する |
| スタックを削除したとき | バケットも中身も削除する (`DESTROY`、`autoDeleteObjects`)。dev と prod の両方 |

### キー

| キー | 内容 |
|---|---|
| `uploads/{jobId}/input.mp4` | 入力の動画。ブラウザが署名付き URL で書き込む |
| `outputs/{jobId}/output.{mp4 か webm}` | 変換後の動画。変換バッチが書き込む。拡張子は[出力コーデック](../term/output-codec.md)で決まる |

`{jobId}` は[ジョブ](../term/job.md)の ID。

### CORS

ブラウザが署名付き URL で直接 PUT・GET するために設定する。

| 項目 | 値 |
|---|---|
| 許可するオリジン | `https://codec-converter.{ベースドメイン}` の 1 つ |
| 許可するメソッド | `PUT`、`GET` |
| 許可するヘッダー | すべて (`*`) |
| プリフライトの結果のキャッシュ (`maxAge`) | 3,600 秒 |

- ベースドメインは、SSM パラメータの `ACM_DOMAIN_NAME` の値で、dev では `dev.nagiyu.com`、prod では `nagiyu.com` ([デプロイ先](../deploy.md)の「ホスト名」)
- 許可するオリジンは、CDK の context `allowedOrigin` で上書きできる。指定すると、上の既定の代わりにその値 1 つになる

## 権限

| 主体 | 操作 | 詳細 |
|---|---|---|
| ブラウザ | 署名付き URL で入力を PUT、出力を GET | [変換の経路](../flow/conversion.md) |
| Web (Lambda) | 署名付き URL の発行、入力の存在の確認 | [Web の実行環境](./web-runtime.md)の「権限」 |
| 変換バッチ | 入力の取得、出力の書き込み | [Batch の実行環境](./batch-runtime.md)の「権限」 |

## 理由

- 入力と出力を 1 日で削除する理由は、[データの保持](../../requirements/non-functional/data-retention.md)の要件にある
- バケットを非公開にし、ブラウザの読み書きを署名付き URL に限る理由は、[セキュリティ](../../requirements/non-functional/security.md)の要件にある
