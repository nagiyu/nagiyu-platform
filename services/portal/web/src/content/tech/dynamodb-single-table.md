---
title: 'DynamoDB single-table design 入門：パーティションキーと GSI の設計'
description: 'DynamoDB の single-table design（単一テーブル設計）の基本を、複数エンティティをひとつのテーブルに格納する具体的な設計例で解説。パーティションキー・ソートキー・GSI の使い分け、アクセスパターンからの逆算手順まで整理します。'
slug: 'dynamodb-single-table'
publishedAt: '2026-03-17'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'DynamoDB', 'NoSQL', '設計']
categories: ['aws']
---

## はじめに

RDB に慣れた開発者が DynamoDB を使い始めると、「テーブルをエンティティごとに分けるべきか、ひとつにまとめるべきか」で悩みます。AWS の公式ガイドや AWS re:Invent のセッションで強く推奨されているのが **single-table design**（単一テーブル設計）です。本記事では nagiyu-platform でも採用しているこの設計の基本と、実装で迷いやすい点を整理します。

## なぜ single-table なのか

DynamoDB は「**事前に決めたアクセスパターンのみ高速に解決できる**」KVS です。エンティティごとにテーブルを作ると、複数エンティティを横断するクエリ（「ユーザー X の最新注文 5 件」など）で複数テーブルを叩くことになり、レイテンシ・コスト・一貫性のすべてが悪化します。

single-table design は **同じテーブルに複数エンティティを格納し、PK/SK の設計でアクセスパターンを 1 リクエストで解決する** アプローチです。

## サンプル: ユーザーと注文

ユーザーが注文を持つ E コマースの簡略例で考えます。アクセスパターン:

1. ユーザー詳細を取得
2. ユーザーの注文履歴を新しい順に取得
3. 注文 ID から注文詳細を取得

これを 1 テーブルで実装します。

| PK           | SK                 | Type  | 属性                   |
| ------------ | ------------------ | ----- | ---------------------- |
| `USER#u_001` | `PROFILE`          | User  | name, email, createdAt |
| `USER#u_001` | `ORDER#2026-04-30` | Order | orderId, total, items  |
| `USER#u_001` | `ORDER#2026-04-25` | Order | ...                    |
| `ORDER#o_42` | `META`             | Order | userId, total          |

PK にエンティティ種別を含めることで、同じテーブルに複数エンティティが共存できます。

## アクセスパターンからの逆算

DynamoDB の設計は **「クエリ → テーブル」** の順で決めます。RDB のように正規化してから後でクエリを最適化する、という順序ではありません。

```
Step 1: アクセスパターンを書き出す
  - getUserProfile(userId)
  - listUserOrders(userId, limit=10)
  - getOrder(orderId)

Step 2: 各パターンが PK/SK / GSI でどう解決されるかを書く
  - getUserProfile → PK=USER#<id>, SK=PROFILE → GetItem
  - listUserOrders → PK=USER#<id>, SK begins_with "ORDER#" → Query (反転で新しい順)
  - getOrder       → PK=ORDER#<id>, SK=META → GetItem

Step 3: 1 リクエストで解決できないパターンは GSI を検討
```

事前に紙やドキュメントでこの 3 ステップを書ききってから実装に入ると、設計のやり直しが減ります。

## SK のプレフィックス

複合 SK は `EntityType#identifier` の形を採用します。

```
PROFILE
ORDER#2026-04-30T15:00:00Z#o_42
ADDRESS#home
ADDRESS#office
```

`begins_with("ORDER#")` で注文だけをまとめて取れます。日付部分を SK の頭に入れると、`Limit` と `ScanIndexForward=false` で「直近 N 件」を高速に取れます。

## GSI（Global Secondary Index）の使い所

PK/SK だけで解決できないパターンは GSI を貼ります。

例: 「メールアドレスからユーザーを引く」

```
GSI1PK = EMAIL#<email>
GSI1SK = USER#<id>
```

GSI のキーは **任意の属性**を割り当てられるので、ベーステーブルの PK/SK とは独立に設計します。「ベーステーブルは ID 中心、GSI はクエリ用の二次キー」という役割分担で考えると整理しやすいです。

## sparse index

GSI のキー属性を持たないアイテムは、その GSI に載りません。これを利用して **特定種別だけを集めた仮想ビュー**を作れます。

```
ORDER アイテムには GSI2PK=ORDERS_ALL, GSI2SK=<createdAt> をセット
USER アイテムには GSI2PK / GSI2SK をセットしない
```

GSI2 を Query すると **注文だけ**が新しい順で取れます。データのフィルタを GSI で表現する典型パターンです。

## アイテムの更新と上書き

`UpdateItem` の `attribute_not_exists(PK)` を ConditionExpression にすると、新規挿入のみ許可（既存があったら失敗）にできます。

```typescript
await client.send(
  new PutCommand({
    TableName,
    Item: { PK: `USER#${id}`, SK: 'PROFILE', email },
    ConditionExpression: 'attribute_not_exists(PK)',
  })
);
```

メールアドレスのユニーク制約も、別アイテム（`EMAIL#<email>` を PK にしたユニーク管理用）で表現できます。RDB の UNIQUE 制約のような直接的サポートはありませんが、トランザクション（`TransactWriteItems`）で「ユーザー作成 + メール予約」を原子的に書けます。

## トランザクション

複数アイテムを原子的に書く場合は `TransactWriteItems` を使います。

```typescript
await client.send(
  new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName,
          Item: { PK: `USER#${id}`, SK: 'PROFILE', email, name },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName,
          Item: { PK: `EMAIL#${email}`, SK: 'RESERVATION', userId: id },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ],
  })
);
```

両方成功 or 両方失敗、が保証されます。RDB のトランザクションと同じ感覚で使えます（ただし最大 100 アイテム）。

## キャパシティモード

- **オンデマンド**: 使った分だけ課金。トラフィックが読みにくい・スパイクするサービス向き
- **プロビジョンド**: 事前に WCU/RCU を確保。アクセスが安定していてコストを最適化したい場合

個人開発・スタートアップは原則オンデマンドで OK。「月額 20 ドル超えてくる」段階で初めてプロビジョンドへの移行を検討します。

## ハマりどころ

- **PK の Hot Partition**: 全アイテムが `PK=GLOBAL` だとスループットが頭打ちになる。一意な PK 分散を意識する。
- **SK のソート順**: 文字列比較なので `ORDER#1`, `ORDER#10`, `ORDER#2` の順になる。日付 ISO や zero-padded 数値を使う。
- **巨大アイテム**: 1 アイテム 400 KB 上限。画像のような大きなデータは S3 に置いて Key だけ DynamoDB に持つ。
- **属性名の衝突**: 単一テーブルに複数エンティティを入れると、`name` のような汎用属性が型違いで混在しがち。アプリ側で型ガードを徹底する。
- **`Scan` は緊急時のみ**: 全件読み出しは I/O が大きく高コスト。本番運用では Query / GetItem のみで完結させる。

## まとめ

single-table design は、DynamoDB の長所（低レイテンシ・高スケーラビリティ）を引き出すための定石です。アクセスパターンを書き出し、PK/SK と GSI でクエリを 1 リクエストに収める、という設計手順を最初に守れば、運用フェーズでの「複数テーブル横断 join 不能問題」に苦しまずに済みます。
