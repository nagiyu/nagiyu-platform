---
title: 'ECR ライフサイクルポリシーで古いイメージを自動削除する'
description: 'Amazon ECR のライフサイクルポリシーを使って古いコンテナイメージを自動削除する設定を解説。タグ付きと untagged の使い分け・rollback 用イメージの保護・コスト削減効果まで実例で紹介します。'
slug: 'ecr-lifecycle-policy'
publishedAt: '2026-04-12'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'ECR', 'コスト最適化']
---

## はじめに

GitHub Actions で毎回 ECR にイメージを push していると、リポジトリには **数百・数千のイメージ**が溜まります。古いイメージは月々のストレージコスト（\$0.10/GB）を押し上げる原因になりますし、コンソールで一覧を眺めるのも辛くなります。ECR のライフサイクルポリシーで自動掃除すると、運用負荷とコストの両方を下げられます。

## 課金構造の確認

ECR の主なコスト要素は次の 2 つ。

- **ストレージ**: \$0.10 / GB / 月
- **データ転送**: 同一リージョン内 ECS / Lambda への pull は無料、外部リージョンや AWS 外への転送は別途課金

平均 200 MB のイメージを 1,000 個保管すると、`200 MB × 1,000 = 200 GB`、月 \$20 のストレージコスト。掃除する価値はあります。

## ライフサイクルポリシーの基本構造

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 production images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep last 5 dev images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-"],
        "countType": "imageCountMoreThan",
        "countNumber": 5
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "Delete untagged images older than 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": { "type": "expire" }
    }
  ]
}
```

ルールは **rulePriority 番号の小さい順**に評価されます。あるルールが「保持」と判定したイメージは、後続ルールで再評価されません。

## 推奨ルール構成（4 種）

### Rule 1: 本番タグは多めに保持

```json
{
  "rulePriority": 10,
  "description": "Keep last 30 prod-* images",
  "selection": {
    "tagStatus": "tagged",
    "tagPrefixList": ["prod-"],
    "countType": "imageCountMoreThan",
    "countNumber": 30
  },
  "action": { "type": "expire" }
}
```

本番にデプロイ済みのイメージは rollback 用に多めに残します。30 個あれば、トラブル時に少なくとも数日前まで戻せます。

### Rule 2: dev タグは少なめ

```json
{
  "rulePriority": 20,
  "description": "Keep last 10 dev-* images",
  "selection": {
    "tagStatus": "tagged",
    "tagPrefixList": ["dev-"],
    "countType": "imageCountMoreThan",
    "countNumber": 10
  },
  "action": { "type": "expire" }
}
```

dev は再ビルドしやすいので少なめで十分。

### Rule 3: latest は守る（タグ前提）

`latest` タグは ECS サービスが参照しているので消さない。**専用ルールを作らない**ことで、デフォルトで保持されます（タグ付きで他のルールに当たらないため）。

### Rule 4: untagged は最短で消す

```json
{
  "rulePriority": 100,
  "description": "Delete untagged after 1 day",
  "selection": {
    "tagStatus": "untagged",
    "countType": "sinceImagePushed",
    "countUnit": "days",
    "countNumber": 1
  },
  "action": { "type": "expire" }
}
```

タグなしイメージは「タグを付け替えて孤立した古いレイヤー」のことが多く、すぐ消して安全です。

## SemVer タグ運用との組み合わせ

タグ付け方式が `v1.2.3` のような SemVer なら、**バージョン番号の正規表現でフィルタ**できます（ECR は正規表現ではなく `tagPrefixList` のみ対応）。SemVer なら `v1` のような prefix で大版数を指定し、minor 以下は数で保持します。

実用上は次のような戦略が綺麗:

- `prod-{git_sha}`: 本番デプロイ済みの commit ベース
- `dev-{git_sha}`: dev 環境用
- `pr-{number}`: PR プレビュー用（短命）
- `latest`, `stable`: 不変の参照タグ

`pr-` プレフィックスは「7 日経過で削除」など別ルールにすると、merge されない PR のイメージが残らず綺麗に保てます。

## Terraform で管理する

CDK / Terraform で IaC 管理しておくと、本番・dev で同じポリシーを適用できます。

```hcl
resource "aws_ecr_lifecycle_policy" "portal" {
  repository = aws_ecr_repository.portal.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 10
        description  = "Keep last 30 prod-* images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["prod-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 100
        description  = "Delete untagged after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}
```

## ドライランで確認

ECR コンソールには **「ライフサイクルポリシーのプレビュー」** 機能があります。本番に適用する前に「これを今動かしたら何が消えるか」を確認できます。AWS CLI でも実行可能:

```bash
aws ecr start-lifecycle-policy-preview \
  --repository-name nagiyu-portal \
  --lifecycle-policy-text file://policy.json

aws ecr get-lifecycle-policy-preview \
  --repository-name nagiyu-portal \
  --max-results 100
```

「想定外のタグが expired 候補に上がっていないか」を必ず確認してから本番適用します。

## ハマりどころ

- **`latest` タグだけのイメージを消さないルール**: latest が指している実体は別 SHA。`tagStatus: "tagged"` で latest が含まれてしまうと意図しない削除が起きる。`tagPrefixList` で明示的に `prod-` 等に絞る。
- **rulePriority の重複**: 同じ番号は使えない。priority は飛び飛び（10, 20, 30...）に振っておくと後から挿入しやすい。
- **未参照の image manifest**: ECS が現在参照しているイメージも、ルール条件を満たせば削除候補になる。最低でも latest と「現行プロダクション」は残るルールを徹底する。
- **マルチアーキテクチャイメージ**: amd64 と arm64 を同タグでまとめている場合、片方だけ消えるとデプロイ時に解決失敗する。マルチアーキ運用ならルール検証を慎重に。
- **ライフサイクルは 1 日 1 回程度評価**: ルール変更直後に消えなくても、数時間〜半日待つと適用される。即時反映ではない。

## まとめ

ECR ライフサイクルポリシーを設定しておくだけで、コンテナイメージのストレージコストとリポジトリのノイズを大きく減らせます。本番 / dev / untagged の 3 ルール程度を最初に入れておけば、運用しながら育てる土台になります。
