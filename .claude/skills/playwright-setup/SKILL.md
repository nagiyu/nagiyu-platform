---
name: playwright-setup
description: Playwright ブラウザを「プロジェクト要求版」で導入する。E2E を実行する前、playwright のブラウザが見つからない／バージョン不一致で落ちるとき、WebKit など追加ブラウザを on-demand で入れたいときに使う。素の npx playwright install は global の罠があるため使わない。
---

# Playwright 準備（env 固有）

## 鉄則: 素の `npx playwright install` を使わない

Claude on Web のベースイメージには **global の Playwright（古いバージョン）** が同梱されており、PATH の都合で素の `npx playwright install` はそちらを呼ぶ。global は「DL 済み」と返すが、プロジェクト同梱の `@playwright/test` が要求するブラウザ版とは異なるため、**揃ったように見えて実は揃っていない**罠が起きる。

`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` は環境側で設定済み。**変更しない**（そのまま尊重する）。

## 使い方

リポジトリルートで同梱スクリプトを実行する（省略時は chromium）:

```bash
# chromium（既定）
.claude/skills/playwright-setup/scripts/install.sh

# WebKit を on-demand で追加（Full CI 相当の確認が必要なときだけ）
.claude/skills/playwright-setup/scripts/install.sh webkit
```

スクリプトはバージョンをハードコードせず、プロジェクトの `@playwright/test` から導出する（追従漏れ防止）。

## 手動で実行する場合

```bash
# npm ci 後（@playwright/test がインストール済みの前提）
node_modules/.bin/playwright install            # OS deps が既に揃っている場合
# または OS deps ごと（root 権限が要る）
sudo -E npx --yes playwright@<version> install --with-deps chromium
```

`<version>` は `node_modules/@playwright/test/package.json` の `version` に揃える。`sudo -E` で `PLAYWRIGHT_BROWSERS_PATH` を保持する。

## E2E 実行までの最短手順

```bash
npm ci
.claude/skills/build-shared-libs/scripts/build.sh   # 共通ライブラリのビルド（先に必要）
.claude/skills/playwright-setup/scripts/install.sh  # chromium
cd services/<svc>/web
../../../node_modules/.bin/playwright test --project=chromium-mobile
```

## 事前確認（不安なとき）

```bash
which aws node playwright           # 主要バイナリ位置
ls /opt/pw-browsers/                # 既存ブラウザ
node_modules/.bin/playwright --version  # プロジェクト要求版
```

## 関連

- [`docs/development/claude-environment.md`](../../../docs/development/claude-environment.md) — env 固有事情の詳細
