# {タスク名} - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/{feature-name}/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/{feature-name}/requirements.md — 受け入れ条件・ユースケース
    - tasks/{feature-name}/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 1: {フェーズ名}

<!-- 前提条件のセットアップ・共通基盤の実装など -->

- [ ] {タスク}（依存: なし）
- [ ] {タスク}（依存: 上記）

## Phase 2: {フェーズ名}

<!-- ビジネスロジックの実装 -->

- [ ] {タスク}（依存: Phase 1）
- [ ] {タスク}（並列実行可能）

## Phase 3: {フェーズ名}

<!-- UI・API Routes の実装 -->

- [ ] {タスク}（依存: Phase 2）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`{service}/core`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/{service}/` の該当ファイルを更新した
- [ ] `tasks/{feature-name}/` ディレクトリを削除した
