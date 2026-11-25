---
sources: []
---

# Claude の実行環境の規約

Claude Code on the web でこのリポジトリを扱うときの、環境固有の事情から導いた規則と、その理由。環境はベースイメージと claude.ai/code の設定 (リポジトリの外) にあり、リポジトリ側の設定ファイルで強制していないため、出典は持たない。

## 環境構築

### セッション開始時の準備は Setup Script に置き、SessionStart hook は使わない

Setup Script は claude.ai/code の環境設定にあり (リポジトリの外)、`claude code` の起動前に 1 度走って、ファイルシステムがキャッシュされる。キャッシュは約 7 日とされる (旧文書の記述。この環境では確かめられず、再測定していない)。重い処理を 1 度払って何度も使う形である。SessionStart hook (`.claude/settings.json`) は毎セッション走り、キャッシュがない。

このリポジトリはモノレポで、複数のサービスが共存する。毎回の前処理を一律に回すと、ほかのサービスの作業では無駄になる。`package-lock.json` と libs のソースは頻繁に変わり、毎回判定すると重く、古い結果を信じると壊れる。そのため `.claude/settings.json` に SessionStart hook は置かない。

### Setup Script には、コードに連動しないものだけを置く

キャッシュは、コードに連動するものを置くと古いまま動き続ける。次を分ける。

| 置く場所 | 対象 | 理由 |
|---|---|---|
| Setup Script | Playwright 用の OS ライブラリ (apt)、Chromium のバイナリ | OS レベルで変わりにくく、毎セッション apt を回すのは重い。`playwright install` は冪等 |
| 置かない (手動、必要なとき) | `npm ci`、共通ライブラリのビルド | `package-lock.json` やソースの変更で、キャッシュが陳腐化する。古い `node_modules` や `dist/` で動き続ける |
| on-demand | WebKit | 使う日が限られる。常駐させると容量と保守が釣り合わない |

### ベースイメージのツールは、リポジトリのスクリプトで入れ直さない

AWS CLI、Node、`apt-get` と `sudo` (root で実行できる)、Java などはベースイメージに入っている。版はイメージで変わるため、ここには書かない。確かめるときは `which aws node` と `node -v` を実行する。

Node はルートの `package.json` の `engines` より古いことがある。2026-11-25 にこの環境で確かめたところ、`node -v` は `engines` の下限より古い版で、警告が出るだけで動いた。

## Playwright

### ブラウザの導入は、素の `npx playwright install` ではなく、プロジェクトの版を指して行う

素の `npx playwright install` は PATH の都合で、ベースイメージが同梱する global の Playwright (2026-11-25 時点で `/opt/node22/bin/playwright`) を呼ぶ。global は自分の版のブラウザを「導入済み」と返して終わるが、プロジェクトの `@playwright/test` が要求する版とは違うため、揃ったように見えて揃っていない状態になる。

呼ぶのは次のどちらかにする。

- プロジェクトローカルの CLI (`node_modules/.bin/playwright install`)
- 版を明示した `npx playwright@<版> install`

版はハードコードせず、`@playwright/test` の版から導く。playwright-setup スキル (`.claude/skills/playwright-setup/SKILL.md`) の同梱スクリプトが、これを行う。`@playwright/test` の版を上げたとき、追従漏れが起きないようにするためである。

### `PLAYWRIGHT_BROWSERS_PATH` は変更しない

ベースイメージが `/opt/pw-browsers` に設定しており、そこにはブラウザが入っている。変えると、入っているブラウザを使えなくなる。`playwright install` の出力先もこのディレクトリになる。

### WebKit は Full CI 相当の確認が必要なセッションでだけ入れる

`playwright-setup` スキルで `webkit` を指定する。`--with-deps` で多数の OS ライブラリが apt 経由で入るため、Setup Script には載せない。

## 共通ライブラリのビルド

### Next.js の起動と E2E の前に、共通ライブラリをビルドする

`libs/*` の `package.json` の `main` は `dist/` を指すが、`npm ci` はビルドを走らせない。`dist/` がないままサービスを起動すると、`@nagiyu/ui` などのモジュール解決に失敗し、`/` が 500 を返す。`next dev` も `next build` も、これに依存する。

ルートの `npm run build:libs` が、依存順にビルドする。順の決まり方は [モノレポの構成の規約](./monorepo.md) にある。手順は build-shared-libs スキル (`.claude/skills/build-shared-libs/SKILL.md`) にある。

### E2E の前には、対象サービスの core もビルドする

サービスの core パッケージも `main` が `dist/` を指し、`npm ci` では作られない。libs のビルドだけを済ませても、起動は成功する。失敗は、core を参照する API を叩いた瞬間に 500 として現れる。E2E では、ブラウザを使わない API テストだけが通り、画面を伴うテストが軒並み落ちる、という紛らわしい形になる。

## DynamoDB Local

### 契約テストは、CI と同じイメージの DynamoDB Local を手元で起動して流す

イメージとポートは [サービスの PR 検証](../specs/ci/service-verify.md) にあり、接続先と認証情報の既定値は [テスト用の DynamoDB Local](../specs/lib/aws/testing.md) にある。CI と同じイメージ名 (`amazon/dynamodb-local`) を使い、手元だけ別のイメージで流して結果が食い違うことを避ける。CI 側はタグを固定していないため、版までは揃わない。

起動は次のとおり。

```bash
docker run -d -p 8000:8000 amazon/dynamodb-local
```

### Docker が使えないと判断する前に、`dockerd` を手で起動する

ベースイメージに `docker` と `dockerd` は入っているが、daemon は自動で起動しない (2026-11-25 に、セッション開始直後の状態で `pgrep dockerd` が空であることを確かめた)。素の状態で `docker run` すると daemon への接続に失敗し、Docker が使えないと誤認しやすい。root で動くため、daemon を手で起動すればそのまま使える。セッションごとに必要である。

```bash
dockerd > /tmp/dockerd.log 2>&1 &
for i in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
```

### DynamoDB Local はアクセスキー ID とリージョンの組ごとに別の DB を持つ

`-sharedDb` を付けない場合、シークレットキーは影響せず、アクセスキー ID とリージョンの組ごとに DB が分かれる。契約テストは固定のダミー認証情報を使うため通常は問題にならないが、手元から別の認証情報やリージョンで覗くと、テーブルが存在しないように見える。

## AWS

### AWS CLI は `--profile nagiyu-dev` か `--profile nagiyu-prod` を毎回付ける

環境変数のアクセスキーが優先されるため、`AWS_PROFILE` では切り替わらない。プロファイルなしの呼び出しは AccessDenied になるが、権限不足ではなく呼び方の誤りである。読み取りを諦めて人に頼む前に、[Claude の AWS アクセス](../specs/resource/claude-access.md) を確かめる。アカウントの構成は [AWS アカウントとアクセス](./aws-accounts.md) にある。
