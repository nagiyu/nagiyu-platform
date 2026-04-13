<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-batch-sizing-fix/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-batch-sizing-fix/requirements.md — 受け入れ条件・背景
    - tasks/quick-clip-batch-sizing-fix/design.md — 変更仕様・境界値根拠
-->

# Batch ジョブサイジング修正 - 実装タスク

## Phase 1: コアロジックの修正

- [ ] `services/quick-clip/core/src/libs/job-definition-selector.ts` の境界値を `EIGHT_GIB` → `FOUR_GIB` に変更する（依存: なし）
- [ ] `services/quick-clip/core/tests/unit/libs/job-definition-selector.test.ts` のテストケース境界値を 4 GiB に更新する（依存: 上記）
- [ ] `services/quick-clip/core` で `npm test` を実行し全件グリーンを確認する（依存: 上記）
- [ ] `services/quick-clip/core` で `npm run typecheck` を実行しエラーがないことを確認する（並列実行可能）

## Phase 2: インフラの修正

- [ ] `infra/quick-clip/lib/batch-stack.ts` の `largeJobDefinition` で `VCPU` を `'2'` → `'4'` に変更する（依存: なし）

## Phase 3: ドキュメント更新

- [ ] `docs/services/quick-clip/architecture.md` に ADR-009 を追記する（内容は `design.md` の「docs/ への移行メモ」を参照）（依存: Phase 1・2 完了後）
- [ ] `tasks/quick-clip-batch-sizing-fix/` ディレクトリを削除する（依存: 上記完了後）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `selectJobDefinition(7_760_000_000)` が `'xlarge'` を返すことを確認した
- [ ] `selectJobDefinition(4 * 1024 * 1024 * 1024 - 1)` が `'large'` を返すことを確認した
- [ ] `selectJobDefinition(4 * 1024 * 1024 * 1024)` が `'xlarge'` を返すことを確認した
- [ ] Lint・型チェックがすべて通過している
- [ ] `docs/services/quick-clip/architecture.md` の ADR-009 を追記した
- [ ] `tasks/quick-clip-batch-sizing-fix/` ディレクトリを削除した
