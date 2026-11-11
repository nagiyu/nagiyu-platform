---
id: tools/term/migration-dialog
title: 初回訪問ダイアログ
kind: term
service: tools
sources:
  - services/tools/src/components/dialogs/MigrationDialog.tsx
  - services/tools/src/app/layout.tsx
sources_hash: 382918c04fd481cedb4c5cfe7e1845d1a30b5c304003fd440eb49b02b3a4549e
related_cards: [tools/screen/home]
related_adr:
  - services/tools/requirements.md#F-006: 初回訪問ダイアログ
---

# 初回訪問ダイアログ

初めて訪れた利用者に、旧バージョンからの移行 (再インストール) を案内する、全画面共通のダイアログ。

## 説明

- 共通レイアウトに置かれていて、どの画面を最初に開いても出る
- 出る条件は、ブラウザの `localStorage` に `tools-migration-dialog-shown` がないとき。ページを開いたあと、次の描画で出る。`localStorage` を読めない環境でも出る
- 内容

| 部分 | 内容 |
|---|---|
| タイトル | 「Toolsアプリが新しくなりました」 |
| 本文 | 大幅にアップデートされたこと、旧バージョンのアンインストールと新バージョンの再インストールの 2 手順、データはすべて端末内にあり外部に送信されないこと |
| 「今後表示しない」 | チェックボックス。初期は ON |
| 「閉じる」 | ダイアログを閉じる |

- 「閉じる」を押したとき、「今後表示しない」が ON なら `tools-migration-dialog-shown` に `true` を保存する。以後の訪問では出ない。OFF なら保存せず、次の訪問でまた出る。保存に失敗しても、そのまま閉じる
- 背景のクリックと Esc キーでは閉じない。「閉じる」を押すまで、後ろの画面は操作できない

## 関連するカード

- [ツール一覧画面](../screen/home.md) (画面の見た目に載せている)
- 各ツール画面とオフライン画面にも、初回の訪問では同じダイアログが出る
