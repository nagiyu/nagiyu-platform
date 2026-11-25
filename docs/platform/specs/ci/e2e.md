---
sources:
  - .github/workflows/reusable-e2e.yml
  - .github/actions/build-web-app/action.yml
sources_hash: 1af7917ae191da7472c042fac349a496ddbe6d882ad51f564cd9729fe4badb10
---

# E2E

サービスの Playwright E2E テストを流し、結果をレポートとして残す再利用ワークフロー `reusable-e2e.yml`。デバイスごとのジョブで、web をビルドしてテストを流し、レポートを Artifact と S3 に保存する。呼び出し元は、E2E を持つサービスの verify である。

## 起点

呼び出し元の verify から `workflow_call` で呼ばれる。PR のイベントで動く前提で、レポートの置き場所に PR 番号を使う。

### 入力

| 入力 | 必須 | 内容 |
|---|---|---|
| `workspace` | 必須 | web のワークスペース名 |
| `shared-workspaces` | 任意 | web より先にビルドする core などのワークスペース (カンマ区切り) |
| `web-dir` | 必須 | web のディレクトリ。レポートと結果の置き場の起点 |
| `report-key` | 必須 | Artifact と S3 上の置き場所の名前 |
| `full` | 必須 | `true` なら 3 デバイス、`false` なら `chromium-mobile` のみ |
| `env` | 任意 | ビルドとテストに渡す追加の環境変数。1 行 1 つの `KEY=VALUE` |

呼び出し側が `full` を渡す。値の決め方は[サービスの PR 検証](./service-verify.md)の「Fast と Full の出し分け」にある。

## 処理

デバイスごとに `E2E Tests (<デバイス>)` のジョブが立つ。`fail-fast: false` で、1 つのデバイスの失敗で他のデバイスの結果とレポートが失われない。

### デバイスとイメージ

| `full` | デバイス |
|---|---|
| `true` | `chromium-mobile`、`chromium-desktop`、`webkit-mobile` |
| `false` | `chromium-mobile` |

ジョブは、ブラウザと OS の依存を入れた共通イメージの上で動く。デバイスが `webkit-` で始まれば `ci:webkit-v3`、それ以外は `ci:chromium-v3`。イメージの作り方は [CI 共通イメージのビルドと公開](./ci-image-build.md) にある。

### 手順

| 順 | 手順 | 流す条件 |
|---|---|---|
| 1 | `env` を `GITHUB_ENV` に書く | `env` が空ではない |
| 2 | `build-web-app` で web をビルドする (`npm ci`、`build:libs`、`shared-workspaces`、対象の順)。Node はイメージのものを使う | 前の手順が通れば |
| 3 | Playwright の版がイメージと揃っているか確かめる | 前の手順が通れば |
| 4 | `npm run test:e2e --workspace=<workspace>` を、環境変数 `CI=true` と `PROJECT=<デバイス>` で流す | 前の手順が通れば |
| 5 | Playwright のレポートを Artifact に保存する | 常に (`if: always()`) |
| 6 | テスト結果 (`test-results`) を Artifact に保存する | 常に (`if: always()`) |
| 7 | PR 用のロールを引き受ける | 常に (`if: always()`) |
| 8 | HTML レポートを S3 にアップロードする | 常に (`if: always()`) |

デバイスの絞り込みは、共通の Playwright 設定が `PROJECT` の値で行う。失敗してもレポートが残るよう、5 から 8 は `if: always()` で流す。

### Playwright の版の確認

イメージのブラウザは、Playwright の版ごとに置き場所が決まる。`npx playwright install --dry-run <chromium か webkit>` で、インストール済みの `@playwright/test` が要求するブラウザの置き場所を取得せずに出力し、そのディレクトリがイメージにあるかを確かめる。出力から置き場所を読み取れないとき、またはディレクトリが 1 つでも無いときは落ちる。

### Artifact

| 名前 | 中身 | 保持期間 |
|---|---|---|
| `<report-key>-playwright-report-<デバイス>` | `<web-dir>/playwright-report/` | 30 日 |
| `<report-key>-test-results-<デバイス>` | `<web-dir>/test-results/` | 30 日 |

### HTML レポートの S3 へのアップロード

PR 用のロール (`vars.AWS_PR_ROLE_ARN`、リージョン `us-east-1`) を引き受け、`<web-dir>/playwright-report/` を次の場所へ `aws s3 sync --delete` で同期する。ロールは[GitHub Actions のロール](../resource/github-actions-oidc.md)にある。

| 項目 | 内容 |
|---|---|
| バケット | 変数 `E2E_REPORTS_BUCKET`。無ければ `nagiyu-e2e-reports` (prod のバケット名) |
| キー | `<report-key>/pr-<PR 番号>/<run ID>/<デバイス>/` |
| 公開 URL | `<ベース URL>/<report-key>/pr-<PR 番号>/<run ID>/<デバイス>/` |

公開 URL のベースは、PR コメントを作る側 (`report-verify-results`) が変数 `E2E_REPORTS_BASE_URL` で決める。無ければ `https://reports.nagiyu.com` (prod の URL) になる。

アップロードに使う PR ロールは dev のアカウントに入るため、2 つの変数 (`E2E_REPORTS_BUCKET`、`E2E_REPORTS_BASE_URL`) は、dev のバケットとホスト名を指している必要がある。既定値 (prod の名前) では、バケットに書き込めない。値は、GitHub の Settings → Secrets and variables → Actions → Variables で見る。バケットそのもの (3 日で消える、公開) は[E2E レポートの置き場所](../resource/e2e-reports.md)にある。

## 失敗したとき

| 症状 | 原因と見方 |
|---|---|
| `<場所> がイメージにありません。イメージの Playwright と package.json の @playwright/test の版がずれています` | イメージの Playwright と、リポジトリの `@playwright/test` の版が違う。`.github/ci-image` の Dockerfile の `PLAYWRIGHT_VERSION` と `VERSION` を上げてイメージを作り直し、その後このワークフローのイメージのタグを替える |
| `Playwright が要求するブラウザの置き場所を読み取れませんでした` | `playwright install --dry-run` の出力に `Install location:` の行が無い |
| テストが落ちる | 「手順」の「失敗したテストを調べる」でレポートを見る |

## 理由

- **イメージの上で動かす**: ブラウザと OS の依存を前もって入れたイメージを使う ([CI 共通イメージのビルドと公開](./ci-image-build.md)に理由がある)。WebKit は、使うデバイスのジョブだけに入れる。
- **版を先に確かめる**: ずれたまま流すと、テストがブラウザを見つけられず、原因が分かりにくい落ち方をする。
- **デバイスごとのジョブに分ける**: 1 つの失敗で他のデバイスの結果とレポートが失われないようにする。
- **E2E のジョブをサービスごとに書かない**: デバイス × サービスの数だけジョブをコピーすると、修正が一部のワークフローにしか入らなくなる。サービスごとの違い (先にビルドする core、web のディレクトリ、レポートの置き場所、追加の環境変数) は入力で渡す。
- **失敗しても S3 に上げる**: 失敗したときこそレポートを見たいため。

## 手順

### 失敗したテストを調べる

1. PR コメントの表の「View」リンクを開く。Playwright の HTML レポートが開き、テストの一覧、失敗したときのスクリーンショット、トレースが見られる
2. 失敗したトレース (`.zip`) は、リンク先からダウンロードして [trace.playwright.dev](https://trace.playwright.dev/) に入れると詳細が見える

レポートが S3 から消えていた (3 日たった) ときは、次のどちらかにする。

- CI を再実行する。新しい run ID でレポートが作り直される
- GitHub Actions の Artifact (30 日保持) から `<report-key>-playwright-report-<デバイス>` をダウンロードする
