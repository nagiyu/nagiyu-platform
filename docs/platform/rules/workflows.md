---
sources: []
---

# ワークフローを書くときの規約

`.github/workflows/` にワークフローを足す・直すときの規則と、その理由。ワークフローごとの振る舞いは CI の仕様 (`docs/platform/specs/ci/` 配下) にある。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 検証の単位と名前

### サービス・ライブラリ・infra ごとに専用の検証ワークフローを作り、ファイル名を `{target}-verify.yml` にする

例: `tools-verify.yml`、`common-verify.yml`。PR のチェックとコメントを対象ごとに分けて見せるためである。1 本にまとめると、どの対象が落ちたかが見えず、無関係な対象の検査を待たされる。

例外として、auth のアプリは `auth-verify-app.yml` と名付けている。

### Fast と Full は 1 本の verify の中で `github.base_ref` で出し分ける

`integration/**` 向けは Fast、`develop` 向けは Full とし、`{target}-verify.yml` を分けない。ファイルを 2 本に分けると、片方だけが直されて検査の中身がずれるためである。出し分けは、再利用ワークフローへ `full: ${{ github.base_ref == 'develop' }}` を渡して行う。

出し分けの中身は [サービスの PR 検証](../specs/ci/service-verify.md)、[E2E](../specs/ci/e2e.md)、[ライブラリの PR 検証](../specs/ci/lib-verify.md) にある。

### 検査は再利用ワークフローを呼び、手で並べない

lint・format・ユニットテスト・カバレッジ・契約テストは `reusable-service-verify.yml`、infra のビルドと synth は `reusable-infra-verify.yml`、E2E は `reusable-e2e.yml`、ライブラリの検査は `reusable-lib-verify.yml` を呼ぶ。対象は `dirs` やワークスペース名で渡す。

手で書くと、書き方がばらつき、検査し忘れたり別のワークスペースを検査したりする。ワークスペースを手で並べると、並べ忘れたパッケージが検査から漏れる。

振る舞いは [サービスの PR 検証](../specs/ci/service-verify.md)、[infra の検証](../specs/ci/infra-verify.md)、[E2E](../specs/ci/e2e.md)、[ライブラリの PR 検証](../specs/ci/lib-verify.md) にある。

### PR コメントの報告は `report-verify-results` を使い、スクリプトをコピーしない

スクリプトをコピーすると、修正が一部のワークフローにしか入らない。`report` ジョブは次を守る。

- `if: always()` を付ける。落ちたジョブがあっても報告するため。
- `needs` に全ジョブを並べる。結果を渡すためではなく、全ジョブの終了を待つため。
- `permissions` に `actions: read` を付ける。action が同じ run のジョブ一覧を API で読むため。

PR コメントで報告する verify に適用する。`infra-common-verify.yml` と `ui-storybook-verify.yml` は報告しない。

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

### 検証の paths は、取りこぼさない側に倒す

paths から漏れた変更では、検証が走らないだけで CI は赤くならない。漏れに気づける仕組みがないため、迷ったら入れる。サービスの検証が持つ paths は次のとおり。

| paths | 理由 |
|---|---|
| `services/<service>/**` | 対象そのもの |
| `libs/**` | 依存ライブラリを個別に列挙しない。依存を足したときに paths の追従を忘れると、その依存先の変更で検証が走らなくなるため。無関係なライブラリの変更で検証が走るコストは許容する。ライブラリどうしの検証も同じ |
| `infra/<service>/**` | infra がある場合 |
| `infra/common/**` | 共通のインフラ部品。変更が全サービスの infra に効く |
| `infra/tsconfig.json` | `infra/<service>` が継承している場合 |
| `configs/**` | 共有の tsconfig・eslint・playwright 設定。変更が全サービスに効く |
| `.github/actions/**` | 共有 composite action。変更が全ワークフローに効く |
| `.node-version` | Node のバージョンを決めるファイル |
| `package.json`、`package-lock.json` | 依存の変更 |
| `.github/workflows/<target>-verify.yml` | ワークフロー自体 |
| 呼んでいる再利用ワークフロー (`reusable-*.yml`) | 直したときに、呼び出し側の検証が走らないと検証から漏れる |

ライブラリの検証は `services/` と `infra/` の行を持たず、`libs/**` 以下の自分のパッケージを指す。

### デプロイは push をトリガーにし、`develop`・`integration/**`・`master` を対象にする

マージ後に自動でデプロイするため。`workflow_dispatch` も許可し、環境を手で選べるようにする。環境は `master` なら prod、それ以外なら dev に振り分ける (振り分けの実装は `.github/actions/setup-environment` の action が持つ)。

サービスのデプロイの paths は、検証の paths と同じ考え方で決める。サービス固有の paths に加えて、`libs/**`・`infra/common/**`・`configs/**`・`package.json`・`package-lock.json`・自分のワークフローを入れる。`libs/**` と `infra/common/**` を含めないと、共通部品の修正がそのサービスの次の変更まで dev・prod に反映されない。

`dev-sync-deploy.yml`・`docs-pages-deploy.yml`・`shared-deploy.yml`・`ui-storybook-deploy.yml` は、対象が違うため `configs/**` を持たない。

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

### ビルド成果物を使うジョブには、ビルドのジョブへの `needs` を張る

web や batch のビルドは core のビルドの後、Docker ビルドは web や batch のビルドの後に流す。前提が壊れているときに、後続を無駄に流さないため。

`needs` で縛るのは成果物の依存だけにする。

- lint・format・テストは `needs` で縛らず、再利用ワークフローの中の手順として流す。lint が落ちても後続を流し、1 回の run で全部の結果を見せるため。
- 依存のないビルド系ジョブどうしは並列にする。

### ビルドは依存順に流す

共有ライブラリは `npm run build:libs`、それ以外は `npm run build --workspace=@nagiyu/hoge` のように個別に流す。`npm run build --workspaces` は使わない。ワークスペースが並列にビルドされ、依存が考慮されずにビルドエラーになるため。順序は `@nagiyu/ui` → `@nagiyu/browser` → `@nagiyu/common` の依存に従う。詳細は [共通ライブラリ設計](../../development/shared-libraries.md) にある。

### PR のターゲットブランチは文脈に合わせて参照する

ジョブの `if:` では `github.base_ref` で参照する (`github.ref` ではない)。`actions/github-script` のスクリプトの中では `github` が API クライアントを指し、`github.base_ref` が undefined になるため、`context.payload.pull_request.base.ref` を使う。

## 新しいサービスやパッケージを足す手順

1. `{target}-verify.yml` を作り、`dirs` を渡して `reusable-service-verify.yml` を呼ぶ。パッケージを既存のディレクトリ配下に足すだけなら、ワークフローは変えない。
2. 検査をかけたいものは、そのパッケージに npm scripts (`lint`、`format:check`、`test`、`test:coverage`、`test:contract`) を用意する。用意しなければ、その検査はかからない。**漏れても CI は赤くならない**ため、新しいパッケージには `lint`・`format:check`・`test`・`test:coverage` を揃えるのを基本とする。
3. infra があるなら、`reusable-infra-verify.yml` を呼ぶジョブも足す。
4. Next.js のビルド・Docker・E2E・サービス固有の検査は、`{target}-verify.yml` にジョブとして残す。再利用ワークフローの対象外である。
5. 検証の paths と、デプロイが要るなら `{target}-deploy.yml` の paths を決める (上の「トリガーと paths」)。

各ワークフローの振る舞いは [サービスの PR 検証](../specs/ci/service-verify.md)、[infra の検証](../specs/ci/infra-verify.md)、[E2E](../specs/ci/e2e.md)、[ライブラリの PR 検証](../specs/ci/lib-verify.md)、[イメージのビルドと ECR への push](../specs/ci/docker-image.md)、[CI 共通イメージのビルドと公開](../specs/ci/ci-image-build.md)、[Node のメジャー版の一致の検査](../specs/ci/node-version-verify.md)、[全体の lint と format の検査](../specs/ci/all-verify.md)、[docs の検査と公開](../specs/ci/docs.md)、[定期の Issue 起票](../specs/ci/scheduled-issues.md) にある。
