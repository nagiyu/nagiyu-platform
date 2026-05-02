---
title: 'CloudFront Functions と Lambda@Edge の使い分け'
description: 'AWS CloudFront のエッジで実行する 2 つのコンピュート、CloudFront Functions と Lambda@Edge を比較。実行タイミング・対応言語・できること・コストを整理し、用途別の使い分け指針をまとめます。'
slug: 'cloudfront-functions-vs-edge'
publishedAt: '2026-04-06'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'CloudFront', 'Lambda@Edge', 'エッジコンピューティング']
---

## はじめに

CloudFront のエッジで動くサーバーレス関数には、**CloudFront Functions** と **Lambda@Edge** の 2 種類があります。役割が似ているので混同しがちですが、実行制約・コスト・対応言語が大きく違います。本記事では実用上の使い分けを整理します。

## 比較表

| 項目                 | CloudFront Functions                      | Lambda@Edge                              |
| -------------------- | ----------------------------------------- | ---------------------------------------- |
| 実行タイミング       | viewer-request, viewer-response           | viewer/origin の req/res 4 か所          |
| 対応言語             | JavaScript（ECMAScript 5.1 準拠の制限版） | Node.js / Python                         |
| 最大実行時間         | 1 ms                                      | viewer 5 秒 / origin 30 秒               |
| 最大メモリ           | 2 MB                                      | 128〜10,240 MB                           |
| ネットワーク呼び出し | 不可                                      | 可能（DynamoDB / S3 など）               |
| コード sizeリミット  | 10 KB                                     | 50 MB                                    |
| コスト               | \$0.10 / 100 万リクエスト                 | \$0.60 / 100 万リクエスト + 実行時間課金 |

CloudFront Functions は **超軽量・超高速・超低コスト**、Lambda@Edge は **重い処理・外部呼び出し可能**、と覚えると整理しやすいです。

## 適材適所のユースケース

### CloudFront Functions が向く

- **HTTP リダイレクト**: `www.example.com` → `example.com`
- **URL リライト**: SPA の `/foo/bar` → `/index.html`
- **シンプルな A/B テスト**: Cookie で振り分け
- **ヘッダ追加・除去**: セキュリティヘッダ、Cache-Control 修正
- **JWT 形式チェック**（署名検証は不可、フォーマットチェックのみ）

### Lambda@Edge が向く

- **DB アクセスを伴う認可**: DynamoDB から API キー検証
- **画像のリサイズ・変換**: Origin 経由で S3 から元画像、Edge で変換
- **A/B テストの複雑なロジック**: 統計的な振り分け、外部 API への参照
- **GeoIP に基づくコンテンツ切り替え**

## CloudFront Functions の実装例

```javascript
// www → apex リダイレクト
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;

  if (host === 'www.nagiyu.com') {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://nagiyu.com' + request.uri },
      },
    };
  }
  return request;
}
```

注意点:

- ECMAScript 5.1 準拠なので `async/await`, `let/const`, アロー関数すら使えない
- `console.log` は `console.log()` のみ。テンプレ文字列・スプレッドは NG
- 1 ms 制限なので、複雑なループや RegExp は厳禁

CloudFront コンソールに直接コードを貼り付けるか、`aws cloudfront update-function` でデプロイします。

## Lambda@Edge の実装例

```typescript
// CloudFrontEvent: 'viewer-request'
import type { CloudFrontRequestHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({ region: 'us-east-1' });

export const handler: CloudFrontRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;
  const apiKey = request.headers['x-api-key']?.[0]?.value;

  if (!apiKey) {
    return { status: '401', statusDescription: 'Unauthorized' };
  }

  const res = await ddb.send(
    new GetItemCommand({
      TableName: 'api-keys',
      Key: { key: { S: apiKey } },
    })
  );

  if (!res.Item) {
    return { status: '403', statusDescription: 'Forbidden' };
  }

  return request;
};
```

Lambda@Edge は通常の Lambda と同じく Node.js / Python で書け、`@aws-sdk` の各クライアントが使えます。ただしリージョンは **us-east-1 にデプロイ必須**（そこから各エッジに自動配布）。

## 実行ポイントの違い

CloudFront のリクエストフローは次の 4 か所で関数を挟めます。

```
Viewer (Browser)
  ↓ viewer-request           ← CloudFront Functions / Lambda@Edge
CloudFront Edge
  ↓ origin-request            ← Lambda@Edge のみ
Origin (S3 / ALB / etc.)
  ↑ origin-response           ← Lambda@Edge のみ
CloudFront Edge
  ↑ viewer-response           ← CloudFront Functions / Lambda@Edge
Viewer (Browser)
```

CloudFront Functions は viewer 側のみ。Lambda@Edge は 4 か所すべてで使えます。「キャッシュより前の処理」は viewer-request、「キャッシュ後にだけ動かす処理」は origin-request、と使い分けます。

## コスト比較

月 1 億リクエスト（個人サービスとしては多めの規模）を想定:

- **CloudFront Functions**: 100 / 100 万 = `\$10`
- **Lambda@Edge**: 0.60 × 100 = \$60 + 実行時間（128 MB × 50ms 平均で約 \$10） = `\$70`

リダイレクトのような軽量処理は **CloudFront Functions が 7 倍以上安い**。コストが効いてくる量だと、選び分けの差が大きくなります。

## デプロイの注意

### CloudFront Functions

- アップロード後、`PUBLISH` ステージに昇格して初めて配信に反映
- ロールバックは旧バージョンを再 publish するだけ

### Lambda@Edge

- バージョン番号付きで CloudFront に紐付ける（`arn:...:1` のように）
- 削除には数時間〜 1 日のラグがある（エッジに配布されているため）
- IAM ロールの信頼ポリシーに `edgelambda.amazonaws.com` を追加する必要がある

## ハマりどころ

- **CloudFront Functions のサイズ上限**: 10 KB は思ったより厳しい。圧縮前のソースで判定されるので、コメントを削るだけで通ることも。
- **Lambda@Edge のコールドスタート**: エッジでも起きる。重要パスでは Provisioned Concurrency を併用。
- **環境変数が使えない**: Lambda@Edge は環境変数非対応。設定値はコードに埋め込むか、外部 KV から取る。
- **デバッグログ**: CloudWatch Logs はエッジロケーションごとに分散される。集約には `aws logs filter-log-events` を全リージョンで叩くか、Logs Insights のクロスアカウント検索を使う。
- **viewer-request での body 編集**: 不可。POST body を変更したいなら origin-request で。

## まとめ

CloudFront Functions は「ヘッダ・URL のシンプルな書き換え専用」、Lambda@Edge は「DB アクセスや画像変換などの重い処理」。実行制約とコストが大きく違うので、**まず CloudFront Functions で済むかを検討し、足りない要件だけ Lambda@Edge に逃がす**のが賢い使い分けです。
