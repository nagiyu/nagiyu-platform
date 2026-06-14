---
title: 'DynamoDB の GSI は 1 デプロイにつき 1 つまで：CloudFormation 一括追加でハマった話'
description: 'CloudFormation / CDK で DynamoDB テーブルに GSI を 2 つ同時追加して "Cannot perform more than one GSI creation or deletion in a single update" で本番デプロイが失敗した実体験を整理。UPDATE 時のみの制約・CREATE 時は一括 OK という仕様の差、RETAIN を踏まえた復旧手順、本番で使える恒久対策まで解説します。'
slug: 'dynamodb-gsi-single-update-limit'
publishedAt: '2026-06-14'
author: 'なぎゆー'
tags: ['AWS', 'DynamoDB', 'CloudFormation', 'CDK', '運用']
categories: ['aws']
relatedServices: ['livetalk']
---

## はじめに

ある日、サービスの本番デプロイがこのエラーで落ちました。

```
Resource handler returned message: "Cannot perform more than one
GSI creation or deletion in a single update"
(HandlerErrorCode: InvalidRequest)
```

CloudFormation（CDK 経由）で DynamoDB テーブルを更新しようとしたところ、`UPDATE_FAILED` → `UPDATE_ROLLBACK_COMPLETE` で即ロールバック。dev 環境では問題なく通っていたのに、本番だけが落ちる、という厄介なパターンでした。原因は DynamoDB のハード制約で、知っていれば一発で分かるのに、知らないと「なぜ dev は通るのか」で延々と悩みます。同じところで詰まる人のために、原因・復旧・恒久対策を残しておきます。

## 何が起きていたか

このときのテーブルは single-table 構成で、アクセスパターンの追加に合わせて GSI を 2 本足そうとしていました。

```typescript
const table = new dynamodb.Table(this, 'MainTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  // ...
});

// あるアクセスパターン用（先に入れたつもりだった GSI）
table.addGlobalSecondaryIndex({
  indexName: 'GSI1',
  partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
});

// 別機能で後から追加した GSI
table.addGlobalSecondaryIndex({
  indexName: 'GSI2',
  partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
});
```

コード上は GSI1 と GSI2 が並んでいるだけです。問題は「**本番テーブルにはまだ GSI が 1 本も無かった**」こと。CloudFormation はこの 1 回の `UpdateTable` で GSI1 と GSI2 を**まとめて 2 本作ろう**としました。そして DynamoDB はそれを拒否します。

## 原因：制約は UPDATE 時だけ、CREATE 時は一括 OK

DynamoDB の制約はこうです。

> **既存テーブルの 1 回の更新（UpdateTable）で作成・削除できる GSI は 1 つまで。**

ここで重要なのは、この制約が **UPDATE 操作にしか効かない** という点です。**テーブルの新規作成（CreateTable）時は、複数の GSI を最初からまとめて定義できます。**

| 操作 | 複数 GSI を同時に | 結果 |
| --- | --- | --- |
| CreateTable（新規作成） | 定義できる | ✅ OK |
| UpdateTable（既存に追加） | 1 回 1 つまで | ❌ 2 つ以上は失敗 |

CloudFormation はテンプレートの差分から「既存テーブルへの更新」と判断し、`UpdateTable` を発行します。そこに GSI 作成が 2 件入っていたため弾かれた、という構図でした。

## なぜ dev では通って本番で落ちたのか

ここが一番ハマったポイントです。同じコードなのに環境で挙動が違う。

理由は**デプロイの「歴史」が環境ごとに違う**から。dev 環境では、機能開発の流れの中で

1. まず GSI1 だけを追加してデプロイ（GSI 作成 1 件 → OK）
2. 後日 GSI2 を追加してデプロイ（GSI 作成 1 件 → OK）

と、**2 回に分けて**入っていました。一方、本番にはリリースのタイミングで GSI1 と GSI2 が**まとめて初めて**流れた。本番テーブルは GSI ゼロの状態からいきなり 2 本追加 → 制約に直撃、というわけです。

つまりこのエラーは「テーブルの現在の状態」と「テンプレートとの差分」に依存します。**コードレビューや synth では検出できず、デプロイ先の実テーブルの状態を見ないと分からない**のがいやらしいところです。

## 復旧手順：データを捨ててよいなら作り直しが最短

幸い、このときの本番テーブルは中身が自分のテストデータだけで、消してしまって構わない状態でした。だったら話は早くて、**テーブルを作り直せば CREATE 操作になり、GSI 2 本を一括で作れます**。コード修正は一切不要でした。

ただし 1 つ罠があります。本番テーブルには `removalPolicy: RETAIN` を設定していたので、**スタックを消してもテーブルは消えず残る**のです。なので順序が大事になります。

```bash
# 1. DynamoDB スタックを削除する
#    RETAIN なのでテーブルは消えず、orphan（スタック管理外）として残る
cdk destroy <DynamoDB スタック名>

# 2. 取り残されたテーブルを手動削除する（データは破棄してよい前提）
aws dynamodb delete-table --table-name <テーブル名> --region <region>
aws dynamodb wait table-not-exists --table-name <テーブル名> --region <region>

# 3. 通常のデプロイを再実行する
#    テーブルが無いので CloudFormation は CreateTable を発行し、
#    GSI を 2 本まとめて作れる
```

ポイントは順序の理由です。

- **テーブルだけ手動削除して再デプロイ → ダメ**。スタックはテーブルが「存在する」前提のまま `UpdateTable` を投げ、消えたテーブルに対して失敗する。CREATE を起こすにはスタックから一度切り離す必要がある。
- **`RETAIN` ゆえスタック削除ではテーブルが残る**。だから orphan テーブルを別途手動で消す手順が要る。

この 3 ステップで本番は無事復旧しました。再作成後もテーブル名は同じなので、テーブル名をコードから独立に組み立てている他スタック（ECS の IAM 権限など）はそのまま整合します。

## 本番データを捨てられない場合の恒久対策

今回は「データ破棄 OK」だから作り直しで済みましたが、**運用中の本番テーブルでは使えない手**です。GSI を 3 本目・4 本目と足すたびに同じ壁が来ます。データを保ったまま対処するなら、GSI の追加を**1 デプロイ 1 本ずつに分割**するしかありません。

CDK なら context フラグで「今回どこまで GSI を有効化するか」を切り替える形にしておくと、段階デプロイを仕組みとして表現できます。

```typescript
// 例: context で追加段階を制御し、1 デプロイ 1 GSI に抑える
const gsiStage = Number(this.node.tryGetContext('gsiStage') ?? '0');

if (gsiStage >= 1) {
  table.addGlobalSecondaryIndex({ indexName: 'GSI1', /* ... */ });
}
if (gsiStage >= 2) {
  table.addGlobalSecondaryIndex({ indexName: 'GSI2', /* ... */ });
}
```

`--context gsiStage=1` でデプロイ → 完了を待って `--context gsiStage=2` で再デプロイ、と段階を踏めば 1 回の更新で増える GSI は常に 1 本に収まります。泥臭いですが、稼働中のテーブルでも安全に積み増せます。「GSI はまとめて足さない。1 デプロイ 1 本」を運用ルールとして頭に刻んでおくのが、結局いちばん効きました。

## ハマったポイント

- **dev で通っても本番で落ちる**。原因はテーブルの状態履歴の差。CI の synth では検出できないので、「複数 GSI を一度に足す変更」は要注意とマークしておく。
- **`RETAIN` の罠**。本番は誤削除防止で `RETAIN` にしがちだが、作り直したいときはスタック削除だけではテーブルが残る。orphan テーブルの手動削除を忘れない。
- **エラーメッセージは素直**。`"Cannot perform more than one GSI creation or deletion in a single update"` はそのままの意味。CDK / CloudFormation のバグを疑う前に、DynamoDB のハード制約を思い出す。
- **削除も 1 回 1 つ**。このエラーは作成だけでなく削除にも効く。GSI を 2 本同時に消すのも不可。リネーム（実体は削除 + 作成）も一度にやると引っかかる。

## まとめ

`Cannot perform more than one GSI creation or deletion in a single update` は、DynamoDB の「**1 回の更新で増減できる GSI は 1 つまで**」という仕様に起因します。新規 CreateTable なら複数 GSI を一括定義できる一方、既存テーブルへの追加（UpdateTable）は 1 本ずつしか通りません。データを捨ててよければテーブル再作成が最短（`RETAIN` の罠に注意）、運用中なら context フラグ等で 1 デプロイ 1 GSI に分割する——この 2 つを押さえておけば、同じエラーで止まっても落ち着いて抜けられます。
