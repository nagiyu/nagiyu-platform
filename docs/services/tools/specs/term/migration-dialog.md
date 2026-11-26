---
sources:
  - services/tools/src/components/dialogs/MigrationDialog.tsx
  - services/tools/src/app/layout.tsx
sources_hash: 0d68d9f5075a6c26b30c1453ab58e492aa36e6708883f7242bcfada52058db17
---

# 初回訪問ダイアログ

初めて訪れた利用者に、旧バージョンからの移行 (再インストール) を案内する、全画面共通のダイアログ。

## 説明

- 共通レイアウトに置かれていて、どの画面を最初に開いても出る
- 出る条件は、ブラウザの `localStorage` に `tools-migration-dialog-shown` がないとき。ページを開いたあと、描画の次のタイミングで出る。`localStorage` を読めない環境では、値がないものとして扱うので出る (読み書きの扱いは [localStorage](../../../../platform/specs/lib/browser/local-storage.md))
- 内容

| 部分 | 内容 |
|---|---|
| タイトル | 「Toolsアプリが新しくなりました」 |
| 本文 | 大幅にアップデートされたこと、旧バージョンのアンインストールと新バージョンの再インストールの 2 手順、データはすべて端末内にあり外部に送信されないこと |
| 「今後表示しない」 | チェックボックス。初期は ON |
| 「閉じる」 | ダイアログを閉じる |

- 「閉じる」を押したとき、「今後表示しない」が ON なら `tools-migration-dialog-shown` に `true` を保存する。以後の訪問では出ない。OFF なら保存せず、次の訪問でまた出る。保存に失敗しても、そのまま閉じる
- 背景のクリックと Esc キーでは閉じない。「閉じる」を押すまで、後ろの画面は操作できない
- 要件は[初回訪問ダイアログ](../../requirements/functional/migration-dialog.md)にある。[ツール一覧画面](../screen/home.md)・各ツール画面・[オフライン画面](../screen/offline.md)のどれを最初に開いても、同じダイアログが出る

## 理由

- 同じドメインで、同名の旧バージョンの Tools を運用していて、新バージョンでは PWA のマニフェストや仕様が変わった。旧バージョンをインストール済みの利用者に、再インストールを促す必要がある
