---
sources: []
---

# ワークフローを書くときの規約

`.github/workflows/` にワークフローを足す・直すときの規則と、その理由。ワークフローごとの振る舞いは CI の仕様 (`docs/platform/specs/ci/` 配下) にある。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 検証の単位と名前

### サービス・ライブラリ・infra ごとに専用の検証ワークフローを作り、ファイル名を `{target}-verify.yml` にする

例: `tools-verify.yml`、`common-verify.yml`。PR のチェックとコメントを対象ごとに分けて見せるためである。1 本にまとめると、どの対象が落ちたかが見えず、無関係な対象の検査を待たされる。

例外として、auth のアプリは `auth-verify-app.yml` と名付けている。

### Fast と Full は 1 本の verify の中で、向き先のブランチで出し分ける

`integration/**` 向けは Fast、`develop` 向けは Full とし、`{target}-verify.yml` を分けない。ファイルを 2 本に分けると、片方だけが直されて検査の中身がずれるためである。出し分けは向き先のブランチ (`github.base_ref`) を見て行い、見る場所は 3 つある。

- E2E のデバイス数。呼び出し側が `reusable-e2e.yml` へ `full: ${{ github.base_ref == 'develop' }}` を渡す。`full` を受け取る再利用ワークフローは、これだけである。
- カバレッジの検査。`reusable-service-verify.yml` が自分で `github.base_ref` を見る。呼び出し側は何も渡さない。
- PR コメントの見出し。`report-verify-results` の `report.js` が、PR の base ref を見る。

ライブラリの検証 (`reusable-lib-verify.yml`) には出し分けがない。

出し分けの中身は [サービスの PR 検証](../specs/ci/service-verify.md)、[E2E](../specs/ci/e2e.md) にある。

### 検査は再利用ワークフローを呼び、手で並べない

lint・format・ユニットテスト・カバレッジ・契約テストは `reusable-service-verify.yml`、infra のビルドと synth は `reusable-infra-verify.yml`、E2E は `reusable-e2e.yml`、ライブラリの検査は `reusable-lib-verify.yml` を呼ぶ。対象は `dirs` やワークスペース名で渡す。

手で書くと、書き方がばらつき、検査し忘れたり別のワークスペースを検査したりする。ワークスペースを手で並べると、並べ忘れたパッケージが検査から漏れる。

振る舞いは [サービスの PR 検証](../specs/ci/service-verify.md)、[infra の検証](../specs/ci/infra-verify.md)、[E2E](../specs/ci/e2e.md)、[ライブラリの PR 検証](../specs/ci/lib-verify.md) にある。

### PR コメントの報告は `report-verify-results` を使い、スクリプトをコピーしない

スクリプトをコピーすると、修正が一部のワークフローにしか入らない。`report` ジョブは次を守る。

- `if: always()` を付ける。落ちたジョブがあっても報告するため。
- `needs` に全ジョブを並べる。結果を渡すためではなく、全ジョブの終了を待つため。
- `permissions` に `actions: read` を付ける。action が同じ試行のジョブ一覧を API で読むため。

PR コメントで報告する verify に適用する。報告するのは、サービスの verify、`infra-shared-verify.yml`、`all-verify.yml`、ライブラリの verify (`reusable-lib-verify.yml` の中の `report`) である。ほかの verify (`docs-structure-verify.yml`、`docs-verify.yml`、`node-version-verify.yml`、`workflow-paths-verify.yml`、`infra-common-verify.yml`、`ui-storybook-verify.yml`) は報告しない。

## トリガーと paths

### 検証は PR をトリガーにし、`develop` と `integration/**` を対象にする

```yaml
on:
  pull_request:
    branches:
      - integration/**
      - develop
```

デプロイの前に PR で検査を済ませ、マージ後のデプロイ失敗を減らすため。

向き先が違うものがある。

| ワークフロー | 向き先 |
|---|---|
| `all-verify.yml` | `develop` と `master` (`integration/**` は対象外) |
| `docs-structure-verify.yml`、`docs-verify.yml`、`node-version-verify.yml`、`workflow-paths-verify.yml` | `integration/**`、`develop`、`master` |
| `ci-image-build.yml` | PR は `integration/**` と `develop`。`develop` への push と手動実行でも動く (イメージの公開のため) |


### 検証の paths は、取りこぼさない側に倒す

paths から漏れた変更では、検証が走らないだけで CI は赤くならない。漏れに気づける仕組みがないため、迷ったら入れる。サービスの検証が持つ paths は次のとおり。

| paths | 理由 |
|---|---|
| `services/<service>/**` | 対象そのもの |
| `libs/**` | 依存ライブラリを個別に列挙しない。依存を足したときに paths の追従を忘れると、その依存先の変更で検証が走らなくなるため。無関係なライブラリの変更で検証が走るコストは許容する。ライブラリどうしの検証も同じ |
| `infra/<service>/**` | infra がある場合。ポータルは infra の置き場がサービス名と違うため、代わりに `infra/bin/**`、`infra/root/**` などを持つ |
| `infra/common/**` | 共通のインフラ部品。変更が全サービスの infra に効く |
| `infra/tsconfig.json` | `infra/<service>` が継承している場合 |
| `configs/**` | 共有の tsconfig・eslint・playwright 設定。変更が全サービスに効く |
| `.github/actions/**` | 共有 composite action。変更が全ワークフローに効く |
| `.github/scripts/**` | composite action が呼ぶスクリプト |
| `.node-version` | Node のバージョンを決めるファイル |
| `package.json`、`package-lock.json` | 依存の変更 |
| `.github/workflows/<target>-verify.yml` | ワークフロー自体 |
| 呼んでいる再利用ワークフロー (`reusable-*.yml`) | 直したときに、呼び出し側の検証が走らないと検証から漏れる |

ライブラリの検証は `services/` と `infra/` の行を持たず、`libs/**` 全体を指す。どのライブラリの検証も、`libs/**` のどこの変更でも動く。

### デプロイは push をトリガーにし、`develop`・`integration/**`・`master` を対象にする

マージ後に自動でデプロイするため。`workflow_dispatch` も許可し、環境を手で選べるようにする。環境は `master` なら prod、それ以外なら dev に振り分ける (振り分けの実装は `.github/actions/setup-environment` の action が持つ)。

デプロイの paths は、そのワークフローが依存する共有のものを含める。サービス固有の paths に加えて、次を入れる。

| paths | 理由 |
|---|---|
| `libs/**`、`infra/common/**` | 含めないと、共通部品の修正がそのサービスの次の変更まで dev・prod に反映されない |
| `configs/**` | 共有の tsconfig・eslint 設定。ビルドと型検査が読む |
| `.node-version` | `setup-node` がこのファイルで Node のバージョンを決める |
| `infra/tsconfig.json` | `infra/<service>` が継承している場合。継承元が変わるとビルドの結果が変わる |
| `package.json`、`package-lock.json` | 依存の変更 |
| 自分のワークフロー | ワークフロー自体 |
| 使う composite action (`.github/actions/<名前>/**`) | 使うものだけを個別に並べる。action の中で使う別の action も並べる |
| `.github/scripts/docker-build-with-retry.sh` | `build-docker-image` が呼ぶスクリプト。Docker イメージをビルドするデプロイに入れる |

検証と違い、`.github/actions/**` 全体は持たない。関係のない action を直しただけで、すべてのサービスがデプロイされるのを避けるためである。使うものを並べるので、サービスのデプロイは `build-docker-image`、`build-web-app`、`health-check`、`push-ecr-image`、`setup-environment`、`setup-node` を持つ。

理由は、検証との違いにある。検証は、デプロイの手順を動かさず、成果物も出さない。そのため、これらの共有のものの変更がデプロイを壊していても、検証では気づけない。デプロイの paths に含めなければ、次に別の変更でデプロイされたときに初めて壊れが表に出る。

### paths の漏れは検査が落とす

`check-workflow-paths.mjs` (`workflow-paths-verify.yml`) が、`paths` を持つ workflow から次を導き、`paths` のどのパターンにも当たらないものを落とす。

- 使う composite action (action の中で使う別の action も辿る)、呼ぶ reusable workflow
- `.github/scripts/` と `.github/workflows/scripts/` のスクリプトの参照
- `node-version-file: .node-version` の参照
- `paths` に `infra/<x>/**`・`services/<x>/**` がある場合、その配下の tsconfig の `extends` の継承元

意図して外すものは、スクリプトの `EXCLUSIONS` に理由つきで持つ。`.github/actions/<使うもの>/**` を並べるときは、action の中で使う別の action も並べる。導き方と失敗の扱いは [workflow の paths の漏れの検査](../specs/ci/workflow-paths-verify.md) にある。

デプロイの paths から外してよいのは、そのワークフローが使わないものだけである。

| ワークフロー | 持たないもの |
|---|---|
| `dev-sync-deploy.yml` | `build-web-app`、`health-check` (Web アプリを持たない) |
| `shared-deploy.yml` | `libs/**` (infra だけをデプロイする)。composite action は `setup-environment`、`setup-node` だけ持つ |
| `docs-pages-deploy.yml` | `libs/**`、`configs/**`、`package.json`、`package-lock.json`、`.github/actions` 配下すべて (`docs/**` と `docs-site/**` を持つ) |
| `ui-storybook-deploy.yml` | `setup-node` 以外の composite action (`setup-environment` を使わない) |

ブランチと環境にも例外がある。

| ワークフロー | 例外 |
|---|---|
| `dev-sync-deploy.yml`、`docs-pages-deploy.yml` | `master` を対象にしない |
| `ui-storybook-deploy.yml` | `master` への push でも動くが、デプロイ先は常に dev。手動実行も dev だけ |
| `docs-pages-deploy.yml`、`ui-storybook-deploy.yml` | `setup-environment` を使わない |

## concurrency

### 検証は PR 単位で打ち切る

```yaml
concurrency:
    group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
    cancel-in-progress: true
```

同じ PR の古いコミットに対する検証は結果を使わないため、新しい run が来たら打ち切って CI の資源を節約する。

### デプロイは環境単位で直列にし、打ち切らない

```yaml
concurrency:
    group: ${{ github.workflow }}-${{ github.event_name == 'workflow_dispatch' && inputs.environment || (github.ref == 'refs/heads/master' && 'prod' || 'dev') }}
    cancel-in-progress: false
```

- グループを環境の単位にするのは、dev が `integration/**` と `develop` で共有されるため。ブランチ単位では、別ブランチからの同時デプロイを防げない。
- 打ち切らないのは、CDK を途中で止めるとスタックが更新中のまま残り、次のデプロイが失敗しやすいため。実行中の run は完走させる。
- 待機できる run はグループごとに 1 つで、新しい run が来ると古い待機中の run はキャンセルされる。最後に push した資材が最後にデプロイされる (後勝ち) 挙動は保たれる。
- dev 固定のワークフロー (`dev-sync-deploy.yml`、`ui-storybook-deploy.yml`) は、環境の部分を `dev` に固定する。
- `docs-pages-deploy.yml` は GitHub Pages の仕組みに合わせ、`group: pages` を使う。

`ci-image-build.yml` は PR だけを打ち切る。

## ジョブの書き方

### ワークスペースはパッケージ名 (`@nagiyu/hoge`) で指定し、パス (`services/hoge`) では指定しない

```yaml
# NG
- run: npm run test --workspace=services/hoge

# OK
- run: npm run test --workspace=@nagiyu/hoge
```

パスより明示的で、ディレクトリを動かしたときにも壊れない。

### ビルドは依存順に流す

共有ライブラリは `npm run build:libs`、それ以外は `npm run build --workspace=@nagiyu/hoge` のように個別に流す。`npm run build --workspaces` は使わない。ワークスペースが `package.json` の定義順に逐次ビルドされ、依存が考慮されずにビルドエラーになるため。

`build:libs` は、ルートの `package.json` に並べた順にライブラリをビルドする。複数の `--workspace` を渡した `npm run` は指定順に 1 つずつ実行するので、並びがそのままビルド順になる。並びは `@nagiyu/common`、`@nagiyu/aws`、`@nagiyu/browser`、`@nagiyu/nextjs`、`@nagiyu/react`、`@nagiyu/ui` で、依存される側が先に来る (`@nagiyu/aws`・`@nagiyu/nextjs`・`@nagiyu/ui` は `@nagiyu/common` に、`@nagiyu/react` は `@nagiyu/browser` と `@nagiyu/common` に依存する)。ライブラリを足す、または依存を変えたときは、この並びを直す。

### PR のターゲットブランチは文脈に合わせて参照する

ジョブの `if:` では `github.base_ref` で参照する (`github.ref` ではない)。`actions/github-script` のスクリプトの中では `github` が API クライアントを指し、`github.base_ref` が undefined になるため、`context.payload.pull_request.base.ref` を使う。

## 新しいサービスやパッケージを足す手順

1. `{target}-verify.yml` を作り、`dirs` を渡して `reusable-service-verify.yml` を呼ぶ。パッケージを既存のディレクトリ配下に足すだけなら、ワークフローは変えない。
2. 検査をかけたいものは、そのパッケージに npm scripts (`lint`、`format:check`、`test`、`test:coverage`、`test:contract`) を用意する。用意しなければ、その検査はかからない。**漏れても CI は赤くならない**ため、新しいパッケージには `lint`・`format:check`・`test`・`test:coverage` を揃えるのを基本とする。
3. infra があるなら、`reusable-infra-verify.yml` を呼ぶジョブも足す。
4. Next.js のビルド・Docker のビルド確認・サービス固有の検査は、`{target}-verify.yml` にジョブとして残す。E2E は `reusable-e2e.yml` を呼ぶジョブを足す。
5. 検証の paths と、デプロイが要るなら `{target}-deploy.yml` の paths を決める (上の「トリガーと paths」)。

各ワークフローの振る舞いは [サービスの PR 検証](../specs/ci/service-verify.md)、[infra の検証](../specs/ci/infra-verify.md)、[E2E](../specs/ci/e2e.md)、[ライブラリの PR 検証](../specs/ci/lib-verify.md)、[イメージのビルドと ECR への push](../specs/ci/docker-image.md)、[CI 共通イメージのビルドと公開](../specs/ci/ci-image-build.md)、[Node のメジャー版の一致の検査](../specs/ci/node-version-verify.md)、[workflow の paths の漏れの検査](../specs/ci/workflow-paths-verify.md)、[全体の lint と format の検査](../specs/ci/all-verify.md)、[docs の検査と公開](../specs/ci/docs.md)、[定期の Issue 起票](../specs/ci/scheduled-issues.md) にある。
