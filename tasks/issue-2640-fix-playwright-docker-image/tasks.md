# Playwright Docker イメージ更新 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2640-fix-playwright-docker-image/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2640-fix-playwright-docker-image/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2640-fix-playwright-docker-image/design.md — 変更対象ファイル・変更内容
-->

## Phase 1: Dockerfile の修正

<!-- バッチ Dockerfile の base イメージタグを更新する -->

- [ ] T001: `services/niconico-mylist-assistant/batch/Dockerfile` の `FROM` 行を `mcr.microsoft.com/playwright:v1.58.0-jammy` から `mcr.microsoft.com/playwright:v1.59.1-jammy` に変更する（依存: なし）

## Phase 2: 動作確認

<!-- Docker ビルドおよびブラウザ起動の正常性を確認する -->

- [ ] T002: `services/niconico-mylist-assistant/batch/` で Docker イメージをビルドし、エラーなく完了することを確認する（依存: T001）
- [ ] T003: ブラウザ起動エラー（`Executable doesn't exist`）が発生しないことをローカルまたは CI で確認する（依存: T002）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Dockerfile のイメージタグが `v1.59.1-jammy` になっている
- [ ] `package.json` の `playwright` バージョン（`1.59.1`）と Dockerfile のタグ（`v1.59.1`）が一致している
- [ ] Lint・型チェックがすべて通過している（`npm run lint --workspace=@nagiyu/niconico-mylist-assistant-batch`）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/niconico-mylist-assistant/` の該当ファイルを更新した
- [ ] `tasks/issue-2640-fix-playwright-docker-image/` ディレクトリを削除した
