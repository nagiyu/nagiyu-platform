---
sources:
  - infra/shared/lib/vpc-stack.ts
  - infra/common/src/utils/vpc.ts
  - infra/common/src/utils/ssm.ts
sources_hash: 860ff420c7c910de99874ced9773207d113c12b566bf54c9992544a4db9bcdaa
---

# 共有 VPC

全サービスが共有する VPC。パブリックサブネットだけを持ち、NAT を置かない。ALB、ECS、AWS Batch が使う。スタックは `NagiyuSharedVpc{Env}` で、スタックの位置づけは[デプロイ先](../deploy.md)にある。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-{env}-vpc` | VPC | 共有のネットワーク |
| `nagiyu-{env}-igw` | インターネットゲートウェイ | VPC をインターネットへつなぐ |
| `nagiyu-{env}-public-subnet-1a` | パブリックサブネット (us-east-1a) | ワークロードの配置先 |
| `nagiyu-{env}-public-subnet-1b` | パブリックサブネット (us-east-1b) | ワークロードの配置先 |
| `nagiyu-{env}-public-rt` | ルートテーブル | 両サブネットで共有する |

`{env}` は `dev` か `prod`。タグは `Application` が `nagiyu`、`Environment` が環境名。サブネットには `Type` が `Public` のタグも付く。

## 設定値

| 項目 | dev | prod |
|---|---|---|
| VPC の CIDR | `10.0.0.0/24` | `10.1.0.0/24` |
| セカンダリ CIDR | `10.2.0.0/24` | なし |
| サブネット 1a の CIDR | `10.0.0.0/24` | `10.1.0.0/25` |
| サブネット 1b の CIDR | `10.2.0.0/24` | `10.1.0.128/25` |
| DNS サポート・DNS ホスト名 | 有効 | 有効 |

- サブネットは両環境とも、起動したリソースにパブリック IP を自動で付ける (`mapPublicIpOnLaunch`)
- ルートテーブルは `0.0.0.0/0` をインターネットゲートウェイへ向ける。両サブネットが関連づく
- NAT ゲートウェイと VPC Flow Logs は作らない。Lambda は VPC に置かない

## SSM パラメータ

スタックが書く。値は環境ごとに別で、利用側のスタックは SSM から読む。

| 名前 | 値 |
|---|---|
| `/nagiyu/shared/{env}/vpc/id` | VPC の ID |
| `/nagiyu/shared/{env}/vpc/cidr` | VPC のプライマリ CIDR |
| `/nagiyu/shared/{env}/vpc/public-subnet-ids` | パブリックサブネットの ID。1a、1b の順にカンマ区切り |
| `/nagiyu/shared/{env}/vpc/igw-id` | インターネットゲートウェイの ID |

名前の定義は `SSM_PARAMETERS` に 1 か所だけある ([インフラの参照名の規約](../../rules/infra-references.md))。スタックは CloudFormation の出力 (VpcId、PublicSubnetIds、InternetGatewayId、VpcCidr) も持つ。

## 利用側の取り込み

利用側のスタックは `importSharedVpc` (`infra/common/src/utils/vpc.ts`) で VPC を取り込む。

- VPC の ID とサブネットの ID を SSM から読み、`us-east-1a` と `us-east-1b` に 1 つずつのパブリックサブネットを持つ VPC として扱う
- サブネットの ID はデプロイ時にしか決まらないので、分割した値からインデックスで取り出す
- 戻り値は VPC と、サブネット ID の一覧

| 利用するもの | 取り込むスタック |
|---|---|
| Portal の ALB と ECS サービス (prod) | `infra/root/alb-stack.ts`、`infra/root/ecs-service-stack.ts` |
| LiveTalk の ALB と ECS サービス | `infra/livetalk/lib/alb-stack.ts`、`infra/livetalk/lib/ecs-service-stack.ts` |
| niconico-mylist-assistant の AWS Batch | `infra/niconico-mylist-assistant/lib/batch-stack.ts` |
| quick-clip の AWS Batch | `infra/quick-clip/lib/batch-stack.ts` |
| codec-converter | `infra/codec-converter/lib/codec-converter-stack.ts` |

## 理由

- パブリックサブネットだけで、NAT ゲートウェイを置かない。NAT は置くだけで固定の費用がかかる。ワークロードは、パブリック IP を付けてインターネットへ出る
- dev も 2 つの AZ にサブネットを持つ。ALB は 2 つ以上の AZ のサブネットを要求するため、dev だけ 1 つにはできない。NAT がないので、AZ を増やしても固定の費用は増えない
- 取り込みは環境で分岐せず、常に 2 サブネットとして扱う。環境ごとに AZ の数を変えると、何 AZ を使うかが取り込み側の書き方に散らばる。AZ を絞りたいときは、各リソースに渡すサブネットの側で選ぶ
- dev にセカンダリ CIDR (`10.2.0.0/24`) を足して 1b のサブネットを作る。プライマリ CIDR を直接広げると VPC の再作成になるため、後から足せるセカンダリで空間を確保する。`10.0.0.0/15` の範囲 (`10.0.x.x` と `10.1.x.x`) は AWS の制約でセカンダリに追加できないため、範囲の外の `10.2.0.0/24` を使う
- 環境ごとに CIDR を分ける (dev は `10.0.x.x` と `10.2.x.x`、prod は `10.1.x.x`)。アドレスを見れば、どちらの環境かがわかるため
- Lambda は VPC に置かない。Function URL や CloudFront 経由で公開し、VPC 内のリソースを必要としないため
