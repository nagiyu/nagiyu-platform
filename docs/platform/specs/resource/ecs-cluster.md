---
sources:
  - infra/shared/lib/ecs-cluster-stack.ts
  - infra/shared/bin/shared.ts
  - infra/common/src/utils/ssm.ts
  - infra/root/ecs-cluster-stack.ts
  - infra/bin/nagiyu-platform.ts
  - infra/livetalk/lib/ecs-service-stack.ts
sources_hash: 86bb4fcc432e7965bb870a334ab125629c5350fbaa5676a1813673d748c63704
---

# 共有 ECS クラスター

ECS で動くサービスが載る、環境ごとに 1 つの ECS クラスター。ALB・ターゲットグループ・ECS サービス・CloudFront は載せるサービスが持ち、クラスターだけを共有する。スタックは `NagiyuSharedEcsCluster{Env}`。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-shared-cluster-{env}` | ECS クラスター | 共有のクラスター |
| `/nagiyu/shared/{env}/ecs/cluster-name` | SSM パラメータ | クラスターの名前 |
| `/nagiyu/shared/{env}/ecs/cluster-arn` | SSM パラメータ | クラスターの ARN |

`{env}` は `dev` か `prod`。利用側は、SSM のクラスター名を読んで取り込む。名前の定義は `SSM_PARAMETERS` にある ([インフラの参照名の規約](../../rules/infra-references.md))。

## 設定値

| 項目 | 値 |
|---|---|
| キャパシティープロバイダー | `FARGATE`、`FARGATE_SPOT` |
| 既定のキャパシティープロバイダー戦略 | なし (サービスが指定する) |
| Container Insights | 無効 |

タグは `Application` が `nagiyu`、`Environment` が環境名、`ManagedBy` が `CDK`、`Component` が `shared`。

## 使っているサービス

| サービス | 取り込み |
|---|---|
| LiveTalk | `infra/livetalk/lib/ecs-service-stack.ts` |

Portal の prod は、共有ではなく専用のクラスター `nagiyu-root-cluster-{env}` を持つ (スタック `NagiyuRootCluster{Env}`、SSM は `/nagiyu/root/{env}/ecs/...`)。設定値は共有クラスターと同じ。Portal の dev は ECS を使わず、クラスターを持たない。

## 理由

- クラスターは共有する。クラスターはサービスをまとめる単位で、同じクラスターで複数のサービスを動かしても互いに影響せず、クラスター自体は費用がかからない。環境ごとにクラスターを持っても費用は増えない
- ALB・ターゲットグループ・ECS サービス・CloudFront・DNS の連携は、サービスが自分のスタックで持つ。アイドルタイムアウトや TLS、ログの設定はサービスの性質で変わるため、共有しない
- 共有リソースの参照は SSM を介し、スタックどうしの直接の依存を避ける
- Container Insights は無効にする。出力される `ECS/ContainerInsights` はカスタムメトリクスとして課金される。得られるディメンションはクラスター名・サービス名・タスク定義のファミリーだけで、コンテナ単位の内訳は元から取れない。サービス単位の CPU とメモリは、無料の `AWS/ECS` 名前空間 (`CPUUtilization`、`MemoryUtilization`) で引き続き取れる
- Portal の prod は、共有クラスターに載せず専用のクラスターを持つ。Portal のインフラは `infra/root` で自己完結し、共有クラスターを参照しない
