---
title: 'DynamoDB single-table design 入門：パーティションキーと GSI の設計'
description: 'DynamoDB の single-table design（単一テーブル設計）の基本を、複数エンティティをひとつのテーブルに格納する具体的な設計例で解説。パーティションキー・ソートキー・GSI の使い分け、アクセスパターンからの逆算手順まで整理します。'
slug: 'dynamodb-single-table'
publishedAt: '2026-03-17'
updatedAt: '2026-06-05'
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

## 実装ノート

ここまでは一般論ですが、nagiyu-platform では実際に全サービスを single-table で通しています。たとえば Quick Clip の `nagiyu-quick-clip-jobs` テーブルは PK/SK の 2 キーだけで、GSI は貼らず TTL（`expiresAt`）で一時データを自動失効させるだけのシンプルな構成にしました。一方で Stock Tracker の `nagiyu-stock-tracker-main` テーブルは要件が複雑で、私は GSI を 4 本貼っています。UserIndex（ユーザーごと）、AlertIndex（バッチ処理用に頻度ごとのアラート一覧）、ExchangeTickerIndex（取引所ごとのティッカー）、ExchangeSummaryIndex（取引所ごとの日次サマリー）で、いずれも `projectionType: ALL`。「ベーステーブルは ID 中心、GSI はアクセスパターンごとの二次キー」という前述の整理を、そのまま GSI 名に落とし込んだ形です。

リポジトリ層は `AbstractDynamoDBRepository` を共通基底に置き、サブクラスは `buildKeys`（PK/SK 生成）・`mapToEntity`・`mapToItem` だけ実装すればよいようにしています。新規作成は `attribute_not_exists` 条件付きの Put で「既存があれば失敗」を保証し、`CreatedAt`/`UpdatedAt` は基底クラスが自動で打ちます。エラーメッセージをすべて日本語で定数化してあるのも、弊プラットフォームの方針です。

## 現在の運用

開発・テスト時にローカルで DynamoDB を立てるのは面倒なので、nagiyu-platform では `USE_IN_MEMORY_DB` という環境変数で InMemory 実装と DynamoDB 実装を切り替えられるようにしています。`createRepositoryFactory` がフラグを見て、`true` なら InMemory リポジトリ、そうでなければ実 DynamoDB リポジトリを返す仕組みです。生成したリポジトリはシングルトンで保持し、Next.js の dev モードでモジュールが二重ロードされても同じインスタンスを掴めるよう、`instanceKey` で `globalThis` に逃がしてあります。これに気づくまで、自分は「dev だと InMemory のデータが API ルートごとに分裂する」という現象に悩まされました。課金は両テーブルともオンデマンド（`PAY_PER_REQUEST`）で、個人開発の読みにくいトラフィックには今のところこれが一番ラクだと感じています。

## ハマったポイント

single-table を運用してきて、自分が実際に踏んだ・警戒している落とし穴を残しておきます。

- **PK の Hot Partition**: 全アイテムを `PK=GLOBAL` のように一点に寄せるとスループットが頭打ちになる。私は PK に必ずエンティティ ID を含めて分散させています。
- **SK のソート順**: 文字列比較なので `ORDER#1`, `ORDER#10`, `ORDER#2` の順に並ぶ。日付は ISO 形式、数値はゼロ埋めで SK に入れて事故を防ぐ。
- **巨大アイテム**: 1 アイテム 400 KB 上限。動画や画像のような大きなデータは S3 に置き、DynamoDB には Key だけ持たせる（Quick Clip はまさにこの形）。
- **属性名の衝突**: 単一テーブルに複数エンティティを混ぜると、`name` のような汎用属性が型違いで混在しがち。だからこそ前述の `mapToEntity` に型ガードを一箇所へ寄せています。
- **`Scan` は緊急時のみ**: 全件読み出しは I/O が大きく高コスト。本番では Query / GetItem だけで完結する設計を崩さないようにしています。

## まとめ

single-table design は、DynamoDB の長所（低レイテンシ・高スケーラビリティ）を引き出すための定石です。アクセスパターンを書き出し、PK/SK と GSI でクエリを 1 リクエストに収める、という設計手順を最初に守れば、運用フェーズでの「複数テーブル横断 join 不能問題」に苦しまずに済みます。
