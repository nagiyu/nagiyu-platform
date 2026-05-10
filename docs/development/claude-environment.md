# Claude 実行環境ガイド

本リポジトリを Claude Code on the web 上で扱うときに知っておくべき環境固有の事情と運用方針をまとめる。CLAUDE.md の運用ルールに従いつつ、ここに書かれた前提のもとで環境構築・E2E 実行・ツール選択を判断する。

---

## 対象環境

| 環境 | 概要 |
|---|---|
| **Claude Code on the web** | claude.ai/code から起動するクラウドサンドボックス。本ドキュメントの主対象 |
| **ローカル devcontainer** | `.devcontainer/{root,admin,...}` 配下の Dockerfile + `postCreateCommand` で構築。Setup Script 機構は持たず、`postCreateCommand` で `npm ci` 等を行う |

両者は同じリポジトリを扱うが、**環境構築のメカニズムが別**である点に注意。本ドキュメントは Web 環境の話を主軸にする。

---

## 環境構築の 2 系統

Claude Code on the web で「セッション開始時に何かを実行させる」手段は 2 つあり、性質が異なる。

### Setup Script（Web 固有）

- **設定場所**: claude.ai/code の環境設定 UI 上の "Setup script" フィールド（**リポジトリ外**）
- **タイミング**: `claude code` 起動 **前**
- **キャッシュ**: 約 7 日。初回実行後にファイルシステムがスナップショット化され、以降のセッションは再利用される
- **対応環境**: Web のみ
- **性質**: イメージビルド的。重い処理を 1 度払って何度も使う形

### SessionStart hook

- **設定場所**: `.claude/settings.json` の `hooks.SessionStart`（**リポジトリ内**）
- **タイミング**: `claude code` 起動 **後**、毎セッション
- **キャッシュ**: なし
- **対応環境**: ローカル CLI / Web 共通
- **性質**: 毎回確認的。軽い冪等処理向き

### 使い分けの判断軸

| 軸 | Setup Script に向く | SessionStart hook に向く |
|---|---|---|
| **陳腐化のしやすさ** | OS レベル / バージョン固定的（apt パッケージ等） | 内容がほぼ変わらず、軽い再確認で済むもの |
| **コスト** | 重い（数十秒〜分）処理を 7 日 1 回で吸収できる | 軽い "already up-to-date" 系 |
| **環境共通性** | Web 限定で良いもの | ローカル devcontainer でも同じ振る舞いを保証したいもの |

7 日キャッシュは「重い install を 1 回で済む」という強みであると同時に、**コードに連動するものを置くと古いまま動き続ける地雷**になる。配置の判断はこの両面性を意識する。

### 本リポジトリでの分類

| 要素 | 配置 | 理由 |
|---|---|---|
| Playwright 用 OS lib（apt） | Setup Script | OS レベル、バージョン更新で apt 名はほぼ変わらない、毎セッション apt は重い |
| Chromium バイナリ | Setup Script（バージョンピン） | 全セッションで使う。`playwright install` は冪等 |
| WebKit バイナリ | **on-demand** | 使う日が限られる。常駐は容量と保守の無駄 |
| AWS CLI 等のクラウドツール | ベースイメージ任せ | プリインストール済み（後述） |
| `npm ci` | **どちらにも入れない** | package-lock 変動で 7 日キャッシュは陳腐化、毎回フル install もモノレポと相性悪い |
| `@nagiyu/*` libs build | **どちらにも入れない** | ソース変更で常に陳腐化。古い `dist/` で動く危険、毎回ビルドはコスト大 |

#### 本リポジトリでは SessionStart hook を使わない方針

モノレポで複数サービスが共存しており、一律の前処理（`npm ci` や全 libs build）は他サービス作業時に無駄になる。また `package-lock.json` と libs ソースは頻繁に変わり、毎回判定すると重く・古い結果を信じると壊れる。**コード連動するものは手動 / 必要時実行**で扱い、SessionStart hook は本リポジトリでは設定しない。

---

## プリインストール済みツール

Claude on Web のベースイメージに同梱されており、リポジトリ側のスクリプトで入れる必要は無いもの。

| ツール | 場所 | バージョン | 備考 |
|---|---|---|---|
| AWS CLI | `/usr/local/bin/aws` | 2.34.x | 認証は環境変数（`AWS_ACCESS_KEY_ID` 等）経由。読み取り専用 IAM が用意されている前提 |
| Node | `/opt/node22/bin/node` | v22 | プロジェクト要求は v24+ だが engine warning のみで実質動作する |
| Playwright（global） | `/opt/node22/bin/playwright` | **1.56.1** | プロジェクト同梱版（1.59.1）と**バージョンミスマッチ**。原則使わない |
| Playwright browsers | `/opt/pw-browsers/chromium-1194` | (global 1.56.1 用) | プロジェクト要求は v1217 系。**そのままでは使えない** |
| `apt-get` / `sudo` | `/usr/bin/{apt-get,sudo}` | — | root 実行可。`playwright install --with-deps` も動く |
| Java / Maven / Gradle / Ruby 等 | `/opt/...` | — | 使う場面では `/etc/profile.d/` 経由で PATH 設定済み |

`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` が環境変数で設定済みなので、`playwright install` の出力先はこのディレクトリになる。

---

## Playwright 運用

### 鉄則: プロジェクトローカルの CLI を使う

`npx playwright install` を素で叩くと、PATH の都合で**ベースイメージ同梱の global 1.56.1** が呼び出される。これは「v1194 はもう DL 済み」と返して終わるが、プロジェクト同梱の `@playwright/test@1.59.1` は **v1217** を要求するため、ブラウザが揃ったように見えて実は揃っていない、という罠が起きる。

正しい呼び出し方は次のいずれか：

```bash
# npm ci 後（@playwright/test がインストールされている前提）
node_modules/.bin/playwright install

# または、バージョンを明示
npx --yes playwright@1.59.1 install
```

### Chromium（Setup Script に登録するスクリプト例）

プロジェクト要求版の Chromium と OS deps を Setup Script でキャッシュさせる。バージョンは `package.json` の `@playwright/test` に追従する。

```bash
#!/bin/bash
set -euxo pipefail
sudo apt-get update
sudo npx --yes playwright@1.59.1 install --with-deps chromium
```

冪等：apt は "already newest"、playwright は "already downloaded" となり 2 回目以降は no-op に近い。

### WebKit（on-demand）

Full CI 相当の確認が必要なセッションでのみ実行する。Setup Script には載せない。

```bash
sudo npx --yes playwright@1.59.1 install --with-deps webkit
```

`--with-deps` で `libgtk-4` / `libwoff2dec` / `libgraphene` 等の多数の OS lib が apt 経由で入り、その後 WebKit バイナリが `/opt/pw-browsers/webkit-<rev>` に展開される。実行後は `webkit.launch()` がそのまま成功する。

### バージョン追従

`@playwright/test` を bump したときは、Setup Script のスクリプト中の `playwright@1.59.1` も同じ番号に更新する。バージョンずれでブラウザが落ちないようピンを揃える。

---

## shared libs のビルド順序

`libs/*` 配下のすべてのパッケージは `package.json` の `"main"` が `"dist/..."` を指している（`@nagiyu/aws` / `@nagiyu/browser` / `@nagiyu/common` / `@nagiyu/nextjs` / `@nagiyu/react` / `@nagiyu/ui`）。

**`npm ci` はビルドを走らせない**ため、`dist/` が無いままサービス（Next.js）を起動すると `@nagiyu/ui` 等のモジュール解決に失敗し、`/` が 500 を返す。`next dev` も `next build` 内のサブステップも、これに依存している。

CI（`.github/workflows/portal-verify.yml` 等）では E2E ジョブの直前に下記の順序で明示的にビルドしている：

```bash
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/browser
npm run build --workspace @nagiyu/ui
npm run build --workspace @nagiyu/nextjs
```

依存方向は `ui → browser → common` および `nextjs → browser → common`。**ローカルで `next dev` や E2E を起動する前にも同じ順で実行する**。

---

## やってはいけないこと

- **素の `npx playwright install` を叩く**: PATH 都合で global 1.56.1 が動き、プロジェクト要求版が入らないまま「DL 済み」と返す
- **Setup Script に `npm ci` や libs build を入れる**: 7 日キャッシュで `node_modules` / `dist/` が陳腐化し、古い状態で動き続ける
- **`.claude/settings.json` の SessionStart hook で `npm ci` や libs build を毎回回す**: モノレポ全体に対して一律前処理になり他サービス作業のコスト増、`package-lock.json` 変動と相性悪い
- **WebKit を Setup Script に常駐させる**: 出番は限定的でストレージと初回起動コストが釣り合わない
- **`PLAYWRIGHT_BROWSERS_PATH` を変更する**: ベースイメージ前提で設定されているのでそのまま尊重する

---

## 参考

- 環境内の事前確認コマンド（不安なときに走らせる）
  ```bash
  which aws node playwright          # 主要バイナリ位置
  ls /opt/pw-browsers/                # 既存ブラウザ
  node -v && npx playwright --version # global Playwright バージョン
  ```
- E2E 実行までの最短手順
  ```bash
  npm ci
  npm run build --workspace @nagiyu/common
  npm run build --workspace @nagiyu/browser
  npm run build --workspace @nagiyu/ui
  npm run build --workspace @nagiyu/nextjs
  node_modules/.bin/playwright install chromium    # Setup Script 未設定なら
  cd services/<svc>/web
  ../../../node_modules/.bin/playwright test --project=chromium-mobile
  ```
