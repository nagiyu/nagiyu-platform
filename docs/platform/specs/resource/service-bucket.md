---
sources:
  - infra/common/src/storage/service-bucket.ts
sources_hash: 397c19dc8f881d30ac251d1202aff32493f124cda20d5e9e2be9e405f5b3307a
---

# サービスの S3 バケット

サービスが使う S3 バケットを作る共通部品 `createServiceBucket`。セキュリティの設定を固定し、バケットごとに差が出ないようにする。

## 固定する設定

呼び出し側は上書きできない (型でも受け付けない)。

| 項目 | 値 |
|---|---|
| 暗号化 | SSE-S3 (`S3_MANAGED`) |
| パブリックアクセス | すべてブロック |
| HTTPS 以外のアクセス | 拒否 (`enforceSSL`) |

## 呼び出し側が決めるもの

上の 3 つ以外の S3 のバケットのプロパティは、そのまま渡される。バケット名、ライフサイクルルール、CORS、バージョニング、削除ポリシー、`autoDeleteObjects` などは、バケットごとに決める。

## 使っているサービス

| バケット | 呼び出し側 |
|---|---|
| E2E レポートの置き場 (shared) | `infra/shared/lib/reports-hosting-stack.ts` |
| codec-converter のストレージ | `infra/codec-converter/lib/codec-converter-stack.ts` |
| niconico-mylist-assistant のスクリーンショット | `infra/niconico-mylist-assistant/lib/s3-stack.ts` |
| quick-clip のストレージ | `infra/quick-clip/lib/storage-stack.ts` |

## 理由

- 暗号化・パブリックアクセスのブロック・HTTPS 限定は、バケットごとに指定を書くと、書き忘れや食い違いが出る。固定すれば、どのバケットも同じ水準になる
