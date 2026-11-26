---
sources: []
---

# 個人リスト

利用者が、自分だけが見られるリストを作り、そこで ToDo を管理できるようにする。操作は共有リストと同じ ([共有リスト](shared-list.md))。ユースケースは[個人の ToDo を管理する](../use-cases/manage-personal-todos.md)。

## 要件

- 利用者が、個人リストを作成できる。名前は 1〜100 文字
- 利用者が、個人リストの名前を変更できる
- 利用者が、個人リストを削除できる。リストの ToDo も消える。デフォルトのリストは削除できない
- 個人リストは 1 人 100 件まで持てる (デフォルトを含む)
- 利用者が、個人リストの中で ToDo を追加・タイトルの編集・完了と未完了の切り替え・削除できる。タイトルは 1〜200 文字
- 個人リストと ToDo は、持ち主だけが読み書きできる ([アクセス制御](../non-functional/access-control.md))
- 画面は、リスト画面で表示範囲を「個人」にして扱う ([リスト画面](../../specs/screen/lists.md))

今の挙動は[個人リスト](../../specs/term/personal-list.md)、[個人リスト API](../../specs/api/personal-lists.md)、[個人 ToDo API](../../specs/api/personal-todos.md)にある。

## やらないこと

なし
