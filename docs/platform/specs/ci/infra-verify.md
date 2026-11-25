---
sources:
  - .github/workflows/reusable-infra-verify.yml
  - .github/actions/list-service-workspaces/action.yml
  - .github/actions/list-service-workspaces/list.js
  - .github/workflows/infra-common-verify.yml
  - .github/workflows/infra-shared-verify.yml
  - .github/workflows/ui-storybook-verify.yml
sources_hash: 5f2e09cc2ffa2c4318dd4f2298f39975d39b09cbb7b13ec73fce998fe5417794
---

# infra の検証

infra の CDK パッケージが、ビルド (tsc) と `cdk synth` を通ることを PR で確かめる再利用ワークフロー `reusable-infra-verify.yml`。lint、書式、ユニットテストは[サービスの PR 検証](./service-verify.md)の検査が受け持つので、ここでは扱わない。

## 起点

呼び出し元は次のとおり。

| 呼び出し元 | 対象 (`dirs`) | 報告 |
|---|---|---|
| サービスの verify の `infra-verify` ジョブ | サービスの infra ディレクトリ | サービスの verify の報告に含まれる |
| `infra-common-verify.yml` | `infra/common` | なし |
| `infra-shared-verify.yml` | `infra/shared` | あり (見出しは Fast / Full を出し分けない) |
| `ui-storybook-verify.yml` | `infra/ui-storybook` | なし |

`infra-common-verify.yml`、`infra-shared-verify.yml`、`ui-storybook-verify.yml` は、サービスではない infra のために、検査 (`reusable-service-verify.yml`) と `reusable-infra-verify.yml` を並べて呼ぶ。`integration/**` と `develop` を向く PR で動き、`master` 向けでは動かない。

### 入力

| 入力 | 必須 | 既定値 | 内容 |
|---|---|---|---|
| `dirs` | 必須 | なし | 対象のディレクトリ (空白か改行で区切る)。ワークスペースそのものを指すと、その配下は拾わない |
| `synth-args` | 任意 | `--context env=dev` | synth の実行ごとの引数。空でない 1 行が synth 1 回にあたる |
| `pre-synth-scripts` | 任意 | 空 | synth の前に流す npm script。1 行が `<ワークスペース名> <npm script 名>` |

## 処理

```mermaid
flowchart LR
    D[discover] --> C["check (infra のワークスペースごと)"]
```

### discover

`list-service-workspaces` を `mode: infra` で呼ぶ。先に `list.test.js` を `node --test` で流す。

対象は、location が `infra` または `infra/` 配下で、`dirs` のいずれかに当たり、`build` を持つワークスペースである。lint や test を持つかは見ない。`synth` を持つかも記録する。location 順に並べる。

### check

ワークスペースごとの matrix (`Infra (<ワークスペース名>)`)。`fail-fast: false` で、共通イメージ `ci:base-v3` の上で動く。

| 順 | 手順 | 流す条件 |
|---|---|---|
| 1 | 依存のインストール | 条件なし (最初の手順) |
| 2 | `@nagiyu/infra-common` のビルド | 前の手順が通り、対象が `@nagiyu/infra-common` ではない |
| 3 | 対象のビルド (`npm run build`) | 前の手順が通れば |
| 4 | synth の前の npm script | 前の手順が通り、`synth` を持ち、`pre-synth-scripts` が空ではない |
| 5 | synth | 前の手順が通り、`synth` を持つ |

#### pre-synth-scripts

先に `npm run build:libs` を流し、そのあと各行の `npm run <npm script 名> --workspace=<ワークスペース名>` を流す。行が 2 つの語でなければ、その行を示して落ちる。synth が libs のビルド成果物 (storybook-static など) を asset として読む場合に使う。`ui-storybook-verify.yml` は `@nagiyu/ui build-storybook` を渡す。

#### synth

`synth-args` の空でない行ごとに、`npm run synth --workspace=<ワークスペース名> -- <引数>` を流す。

- 行の先頭から続く `KEY=VALUE` の形の語は、環境変数として渡す。残りが `cdk synth` の引数になる
- 語は空白で分けるので、空白を含む値は渡せない (引用符で囲んでもまとまらない)
- 環境変数 `IMAGE_TAG=synth` を常に渡す。コンテナイメージを使うスタックは、`IMAGE_TAG` が無いと合成できない。合成だけで実在のイメージは参照しない
- 1 行も synth を流さなかったときは、検査したつもりにならないよう落ちる

呼び出し側は `synth-args` で、スタックが要る context や環境変数を渡す。`infra-shared-verify.yml` は、`DOMAIN_NAME=example.com --all --context env=dev` と、それに `--context accountScope=dev` を足した 2 行を渡し、prod アカウントと dev アカウントの両方の合成が通ることを確かめる。

## 失敗したとき

| 症状 | 原因と見方 |
|---|---|
| `discover` が `build を持つ infra のワークスペースが見つかりません` で落ちる | `dirs` が `infra/` 配下のどのワークスペースにも当たらないか、当たったワークスペースが `build` を持たない |
| `pre-synth-scripts の行は ... の形で指定してください` | 行が `<ワークスペース名> <npm script 名>` の 2 語ではない |
| `synth-args に synth の実行が 1 行もありません` | `synth-args` に空でない行がない |
| `Build` が落ちる | tsc のエラー。対象のワークスペースは、手順 2 で作った `@nagiyu/infra-common` のビルド成果物を参照する |
| `Synthesize CDK stacks` が落ちる | スタックの合成に必要な context や環境変数が足りない。呼び出し側の `synth-args` で渡す |

## 理由

- **ワークスペースを `dirs` から導く**: ビルドと synth をワークフローごとに手で書くと、形がばらついて検査が漏れる。ディレクトリから導けば、infra のパッケージを足してもワークフローを書き換えずに済む。
- **lint などと分ける**: infra の検査は、lint や test を持つかによらず、ビルドできることと synth できることだけを見る。対象は `build` を持つかどうかで決める。
- **`dirs` がワークスペースを指すときは配下を拾わない**: `infra` 自体がワークスペースなので、配下も拾うと `infra/*` まで巻き込む。拾わないことで、ルートの `infra` だけを対象にできる。
