---
sources:
  - package.json
sources_hash: 9eef7f300a13e7d4212439339981e216a99753fce7c59f1b83f5567e20f50d4c
---

# モノレポの構成の規約

npm workspaces によるモノレポの、ディレクトリ・パッケージ名・ワークスペースの形と、サービスや lib を足すときの決まり。各パッケージの責務と依存の方向は [アーキテクチャの規約](./architecture.md)、ワークフローの足し方は [ワークフローの規約](./workflows.md) にある。

## ワークスペース

### ワークスペースは、ルートの `package.json` の `workspaces` に載る場所に置く

載らないパッケージは npm の対象にならず、依存の解決も `npm run --workspaces` の一括実行も効かない。CI が検査の対象を決めるときも `workspaces` を展開して読む ([サービスの PR 検証](../specs/ci/service-verify.md))。載せる場所は次のとおり。

| 場所 | 置くもの |
|---|---|
| `services/<service>/core`、`web`、`batch` | サービスのパッケージ |
| `services/<service>/lambda/*` | 1 つのサービスの中の Lambda ごとのパッケージ。今は quick-clip だけが持つ |
| `services/tools` | tools は 1 つのパッケージで、core・web・batch に分けない |
| `libs/*` | 共通ライブラリ |
| `infra`、`infra/*` | CDK |
| `docs-site` | docs の公開サイト |

`workspaces` には、実在しない場所のパターン (`web-*`、`batch-*`、`api`) も並んでいるが、使っているサービスはない。

## ディレクトリ名

### ディレクトリ名は小文字のケバブケースにする

例: `codec-converter`、`share-together`。ディレクトリ名からパッケージ名を導くため、npm のパッケージ名に使える小文字にそろえる。サービスの下の役割は、`core`・`web`・`batch` の名前にする。quick-clip だけは、Lambda ごとのパッケージを `lambda/<name>` に置く。

## パッケージ名

### パッケージ名は `@nagiyu/` で始める

| 場所 | パッケージ名 |
|---|---|
| `libs/<name>` | `@nagiyu/<name>` |
| `services/<service>/core`、`web`、`batch` | `@nagiyu/<service>-core`、`@nagiyu/<service>-web`、`@nagiyu/<service>-batch` |
| `services/quick-clip/lambda/<name>` | `@nagiyu/quick-clip-lambda-<name>` |
| `services/tools` | `@nagiyu/tools` |
| `infra` | `@nagiyu/infra` |
| `infra/<name>` | `@nagiyu/infra-<name>` |
| `docs-site` | `@nagiyu/docs-site` |

例外として、admin の web は `@nagiyu/admin` である。

名前をディレクトリから導ける形にそろえると、CI や `--workspace` での指定が推測できる。ワークフローではパス (`services/hoge`) ではなく、このパッケージ名で指定する ([ワークフローの規約](./workflows.md))。

## ビルド

### 共有 libs は `npm run build:libs` で依存順にビルドする

libs のビルドは、ルートの `package.json` の `build:libs` が `--workspace` を依存順に並べて 1 つずつ実行する。npm は複数の `--workspace` を指定順に実行するため、並びがそのままビルド順になる。並びは `@nagiyu/common`、`@nagiyu/aws`、`@nagiyu/browser`、`@nagiyu/nextjs`、`@nagiyu/react`、`@nagiyu/ui` で、依存される側が先に来る。

`npm run build --workspaces` は使わない。依存順ではなくワークスペースの定義順に実行され、依存先のビルド成果物がない状態でビルドが始まって失敗するためである。libs 以外は、`npm run build --workspace=@nagiyu/hoge` のように個別に流す。

依存の方向は [アーキテクチャの規約](./architecture.md) にある。

## 足すときの決まり

### lib を足したら、`build:libs` の並びを直す

足した lib を、依存先の後ろ、依存元の前に差し込む。並べ忘れると、ビルド順が崩れ、lib が `build:libs` の対象から漏れる。lib の検証ワークフローを足す手順は [ワークフローの規約](./workflows.md) にある。

### サービスを足したら、サービスの規約に沿ったパッケージを用意する

- パッケージを [アーキテクチャの規約](./architecture.md) の責務で分け、名前を上の表にそろえる。
- パッケージには、検査に必要な npm scripts を [設定ファイルの規約](./configs.md) の標準スクリプト名で用意する。
- 検証・デプロイのワークフローを足す手順は [ワークフローの規約](./workflows.md) にある。
