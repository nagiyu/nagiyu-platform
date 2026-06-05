---
title: 'S3 Presigned URL でブラウザから直接安全にアップロード／ダウンロードする'
description: 'S3 Presigned URL を使って、認証情報をクライアントに渡さずブラウザから S3 へ直接アップロード・ダウンロードする実装方法を解説。期限・サイズ制限・Content-Type 拘束など、本番運用で必要なセキュリティ設計まで踏み込みます。'
slug: 's3-presigned-url'
publishedAt: '2026-04-18'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'S3', 'セキュリティ']
categories: ['aws']
relatedServices: ['quick-clip', 'codec-converter']
---

## はじめに

S3 にファイルを上げるとき、クライアントから AWS 認証情報を直接使うのは避けたいです。Presigned URL を使えば、サーバーが署名済み URL を発行して、**その URL に対してだけ・限られた時間だけ・限られた条件で** S3 にアクセスさせられます。本記事では nagiyu-platform の動画アップロード機能で実装している方法を整理します。

## 全体の流れ

```
1. クライアント → API: 「ファイル名と Content-Type を教える」
2. API → S3: PutObject 用の署名済み URL を生成
3. API → クライアント: 署名済み URL を返す
4. クライアント → S3: 署名済み URL に直接 PUT
5. S3 → クライアント: 200 OK
6. （オプション）S3 イベント → Lambda: 後続処理（変換・サムネ生成など）
```

ファイル本体が API サーバーを経由しないので、**サーバーの帯域・メモリ・CPU を消費しません**。動画のような大きなファイルでも、API は数 KB の URL を返すだけです。

## アップロード用 Presigned URL の生成

AWS SDK for JavaScript v3 の例です。

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: 'ap-northeast-1' });

export async function createUploadUrl(
  contentType: string,
  contentLength: number
): Promise<{ url: string; key: string }> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error('Unsupported content type');
  }
  if (contentLength > MAX_BYTES) {
    throw new Error('File too large');
  }

  const key = `uploads/${randomUUID()}`;
  const command = new PutObjectCommand({
    Bucket: 'nagiyu-uploads',
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}

const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png']);
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB
```

`ContentType` と `ContentLength` を署名に含めることで、**クライアントが宣言と異なる Content-Type やサイズで PUT すると S3 が 403 を返します**。「画像です」と申告しておいて実行ファイルを上げる、といった攻撃を弾けます。

## クライアント側のアップロード

```typescript
async function uploadFile(file: File): Promise<string> {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: file.type,
      contentLength: file.size,
    }),
  });
  const { url, key } = await res.json();

  const put = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!put.ok) {
    throw new Error(`Upload failed: ${put.status}`);
  }
  return key;
}
```

S3 への PUT は **API ではなく直接 S3 に対して**行う点がポイントです。リクエストヘッダの `Content-Type` は署名と一致させる必要があります（ずれると 403）。

## ダウンロード用 Presigned URL

ダウンロードも同じ仕組みで `GetObjectCommand` を使います。期限切れの URL でアクセスできない、という安心感が得られます。

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';

export async function createDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: 'nagiyu-uploads',
    Key: key,
    ResponseContentDisposition: 'attachment; filename="video.mp4"',
  });
  return getSignedUrl(s3, command, { expiresIn: 60 });
}
```

`ResponseContentDisposition` を渡すと、ブラウザがインライン表示ではなく**ダウンロードダイアログを出す**ようにできます。

## 期限の設計

`expiresIn` の値（秒）は次の方針で決めます。

- アップロード用: **5 分（300 秒）程度**。ユーザーが画面で操作している前提
- ダウンロード用: **1〜10 分**。リンクを長く有効にしないことで漏洩リスクを下げる
- 一時共有用: 長くても **24 時間**。それ以上は別の認可機構を検討

短くしすぎるとユーザー体験が悪化（モバイル回線でアップロードに 5 分超かかる）するので、想定回線速度から逆算します。

## 1 GB を超えるファイルはマルチパートアップロード

PUT は単発のリクエストなので、ネットワークが切れると最初からやり直しになります。1 GB を超える動画などはマルチパートアップロードが望ましいです。

```typescript
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';

// 1. 開始
const init = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType }));
const uploadId = init.UploadId!;

// 2. 各パート用の Presigned URL を発行
const partUrls = await Promise.all(
  parts.map((_, i) =>
    getSignedUrl(
      s3,
      new UploadPartCommand({ Bucket, Key, UploadId: uploadId, PartNumber: i + 1 }),
      { expiresIn: 600 }
    )
  )
);

// クライアントは各 URL に並列 PUT
// 3. 完了通知
await s3.send(
  new CompleteMultipartUploadCommand({
    Bucket,
    Key,
    UploadId: uploadId,
    MultipartUpload: { Parts: completedParts },
  })
);
```

部分的に失敗しても再送できる、並列で帯域を活かせる、という利点があります。

## バケットポリシー側の防御

Presigned URL でも「バケットを誤設定して全世界公開」というケースは防げません。バケットポリシーで明示的にブロックします。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::nagiyu-uploads/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "DenyPublicAcl",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": ["arn:aws:s3:::nagiyu-uploads/*"],
      "Condition": {
        "StringEquals": { "s3:x-amz-acl": "public-read" }
      }
    }
  ]
}
```

加えて **Block Public Access を ON** にしておきます。Presigned URL は ACL に依存しないので、Block Public Access が ON でも普通に動きます。

## ハマりどころ

- **時計ずれ**: ローカルの時計が大きくずれていると署名が無効と判定される。NTP 同期を確認。
- **`Content-Type` の差異**: 署名に含めた値と PUT 時のヘッダが一致しないと 403。ブラウザが勝手に `application/octet-stream` に書き換えるケースに注意。
- **バケットのリージョンと SDK の region**: 不一致だと 301 リダイレクトが発生し、Presigned URL が壊れる場合がある。
- **CORS 設定**: ブラウザから直接 PUT するなら、S3 バケットに `PUT` を許可する CORS 設定が必須。

```json
[
  {
    "AllowedOrigins": ["https://nagiyu.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## まとめ

S3 Presigned URL は、サーバーを経由せずに安全にファイルの受け渡しができる仕組みです。**期限・Content-Type・サイズ・CORS・バケットポリシー**を組み合わせて多重に防御することで、認証情報をクライアントに露出せず、本番運用に耐えるアップロード機能を実装できます。
